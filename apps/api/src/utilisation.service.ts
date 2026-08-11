import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { VaultService } from "./vault.service";
import { BillingService } from "./billing.service";
import { IMptAdapter, MPT_ADAPTER } from "./integrations";
import { Inject } from "@nestjs/common";

// Отчёт о нанесении (W3, п.26): POST /utilisation → reportId; поллер доводит до SUCCESS/ERROR.
@Injectable()
export class UtilisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly billing: BillingService,
    @Inject(MPT_ADAPTER) private readonly mpt: IMptAdapter
  ) {}

  async submit(
    tenantId: string,
    idempotencyKey: string,
    body: {
      orderId: string;
      releaseType: string;
      expirationDate?: string;
      productionDate?: string;
      manufacturerCountry?: string;
    }
  ) {
    if (!idempotencyKey)
      throw new BadRequestException("Idempotency-Key header required");
    if (!body.releaseType)
      throw new BadRequestException("releaseType required");
    if (!body.expirationDate)
      throw new BadRequestException("expirationDate required");
    if (!body.productionDate)
      throw new BadRequestException("productionDate required");
    if (!body.manufacturerCountry)
      throw new BadRequestException("manufacturerCountry required");

    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
      include: { lines: true },
    });
    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException("order not found");
    if (
      order.status !== "COMPLETED" &&
      order.status !== "PARTIALLY_COMPLETED"
    ) {
      throw new BadRequestException(
        "order is not completed (codes not emitted)"
      );
    }

    // идемпотентность по Idempotency-Key: повтор с тем же ключом → существующий report
    const existing = await this.prisma.utilisationReport.findUnique({
      where: { idempotencyKey },
    });
    if (existing) {
      return { reportId: existing.reportId, status: existing.status };
    }

    // полные КМ из Vault (reveal + аудит CV-032)
    const codes = await this.vault.reveal(body.orderId, tenantId);
    if (codes.length === 0) throw new NotFoundException("no codes in vault");
    const sntins = codes.map((c) => c.serial);
    await this.vault.logExport(
      tenantId,
      body.orderId,
      "tenant",
      "export",
      sntins.length,
      "utilisation report"
    );

    const sub = await this.mpt.submitUtilisation({
      tenantId,
      sntins,
      businessPlaceId: 1,
      releaseType: body.releaseType,
      expirationDate: body.expirationDate,
      productionDate: body.productionDate,
      manufacturerCountry: body.manufacturerCountry,
    });
    await this.prisma.utilisationReport.create({
      data: {
        tenantId,
        orderId: body.orderId,
        idempotencyKey,
        reportId: sub.reportId,
        status: sub.status,
        sntins,
        releaseType: body.releaseType,
        expirationDate: body.expirationDate,
        productionDate: body.productionDate,
        manufacturerCountry: body.manufacturerCountry,
        businessPlaceId: "1",
        rejectReason: sub.rejectReason ?? null,
      },
    });
    // ERROR сразу: задача оператору (ID-017)
    if (sub.status === "ERROR") {
      await this.prisma.outbox.create({
        data: {
          aggregate: "mpt-order-timeout",
          status: "FAILED",
          payload: {
            orderId: body.orderId,
            tenantId,
            reason: `utilisation rejected: ${sub.rejectReason ?? "unknown"}`,
            reportId: sub.reportId,
          },
        },
      });
    }
    return { reportId: sub.reportId, status: sub.status };
  }

  // поллер: IN_PROCESS → SUCCESS (SETTLE) / ERROR (задача)
  async pollReports(): Promise<void> {
    const reports = await this.prisma.utilisationReport.findMany({
      where: { status: "IN_PROCESS" },
      take: 50,
    });
    for (const report of reports) {
      await this.reconcile(report.id).catch(() => {});
    }
  }

  private async reconcile(reportId: string): Promise<void> {
    const report = await this.prisma.utilisationReport.findUnique({
      where: { id: reportId },
    });
    if (!report || report.status !== "IN_PROCESS") return;
    const st = await this.mpt.getUtilisation(report.reportId);
    if (st.status === "SUCCESS") {
      // SETTLE (п.26): totalPrice из снимка заказа, резерв гасится (RELEASE остатка)
      const order = await this.prisma.order.findUnique({
        where: { id: report.orderId },
        include: { lines: true },
      });
      if (!order) return;
      const totalPrice = order.lines.reduce(
        (s, l) => s + l.totalPrice,
        BigInt(0)
      );
      if (!report.settled) {
        await this.billing.settle(
          order.tenantId,
          order.id,
          totalPrice,
          `utilisation ${report.reportId}`
        );
        await this.prisma.utilisationReport.update({
          where: { id: report.id },
          data: { status: "SUCCESS", settled: true },
        });
      }
      // коды → UTILISED
      await this.prisma.codeVault.updateMany({
        where: { orderId: order.id },
        data: { status: "UTILISED" },
      });
      // резерв заказа гасится (если остался активный)
      await this.billing
        .release(order.tenantId, order.id, "settle on utilisation")
        .catch(() => {});
      return;
    }
    if (st.status === "ERROR") {
      // списания НЕТ; задача оператору (ID-017) с rejectReason
      await this.prisma.utilisationReport.update({
        where: { id: report.id },
        data: {
          status: "ERROR",
          rejectReason: st.rejectReason ?? "utilisation rejected",
        },
      });
      await this.prisma.outbox.create({
        data: {
          aggregate: "mpt-order-timeout",
          status: "FAILED",
          payload: {
            orderId: report.orderId,
            tenantId: report.tenantId,
            reason: `utilisation rejected: ${st.rejectReason ?? "unknown"}`,
            reportId: report.reportId,
          },
        },
      });
      return;
    }
    // IN_PROCESS — ждём следующий тик
  }
}
