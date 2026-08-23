import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { BillingService } from "./billing.service";
import { splitVat, vatRatePct } from "@markflow/shared";

// Счета на оплату (W5-07): ISSUED → PAID (confirm/TOPUP по ref1c=номер) | CANCELLED.
// number MF-2026-NNNN — глобальный счётчик (unique + retry P2002).
//
// W0-03a (ADR-027): все операции dual-scoped по (tenantId, legalEntityId).
// kaspiWebhook — fail-closed: без настроенного KASPI_WEBHOOK_SECRET эндпоинт скрыт.

export function invoiceNumber(n: number): string {
  return `MF-2026-${String(n).padStart(4, "0")}`;
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService
  ) {}

  async create(
    tenantId: string,
    legalEntityId: string,
    body: { productGroup: string; quantity: number }
  ) {
    if (!body.productGroup)
      throw new BadRequestException("productGroup required");
    const qty = Number(body.quantity);
    if (!Number.isInteger(qty) || qty < 1)
      throw new BadRequestException("quantity must be >= 1");
    const tariff = await this.billing.activeTariff(body.productGroup);
    const unitPrice = BigInt(tariff.pricePerCodeKZT);
    const sumWithVat = unitPrice * BigInt(qty);
    const rate = vatRatePct();
    const { sumWithoutVat, vat } = splitVat(sumWithVat, rate);

    let invoice;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const last = await this.prisma.invoice.aggregate({
          _max: { number: true },
        });
        const number = (last._max.number ?? 0) + 1;
        invoice = await this.prisma.invoice.create({
          data: {
            tenantId,
            legalEntityId,
            number,
            productGroup: body.productGroup,
            quantity: qty,
            unitPrice,
            sumWithoutVat,
            vat,
            sumWithVat,
            vatRatePct: rate,
            status: "ISSUED",
          },
        });
        break;
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "P2002" && attempt === 0) continue;
        throw e;
      }
    }
    if (!invoice) throw new ConflictException("invoice number conflict");
    return this.view(invoice);
  }

  // confirm: TOPUP (ref1c=номер счёта) → PAID. Повторный confirm идемпотентен.
  // ADR-027: dual-scope — только юрлицо активного скоупа.
  async confirm(
    tenantId: string,
    legalEntityId: string,
    invoiceId: string,
    paymentRef: string
  ) {
    if (process.env.PAYMENTS_ENABLED !== "true")
      throw new ForbiddenException(
        "payments disabled (PAYMENTS_ENABLED=false)"
      );
    if (!paymentRef?.trim())
      throw new BadRequestException("paymentRef required");
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, legalEntityId },
    });
    if (!invoice) throw new NotFoundException("invoice not found");
    if (invoice.status === "PAID") return this.view(invoice);
    // ADR-027 payment-boundary: verify account belongs to the invoice's legal entity
    const account = await this.prisma.account.findFirst({
      where: { tenantId, legalEntityId: invoice.legalEntityId },
    });
    if (!account)
      throw new ForbiddenException(
        "no account for this legal entity — payment boundary"
      );
    const ref1c = invoiceNumber(invoice.number);
    const { existing } = await this.billing.topup(
      tenantId,
      ref1c,
      invoice.sumWithVat,
      `оплата счёта ${ref1c}`
    );
    if (existing) return this.view(invoice);
    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paymentRef, paidAt: new Date() },
    });
    return this.view(updated);
  }

  // Kaspi-вебхук: paymentRef=операция → авто-PAID.
  // ADR-027 payment-boundary: fail-closed — требует KASPI_WEBHOOK_SECRET.
  // Без настроенного секрета эндпоинт всегда возвращает 404 (не раскрывает существование).
  async kaspiWebhook(
    body: { invoiceId: string; paymentRef: string; signature?: string },
    secret: string | undefined
  ): Promise<{ status: string }> {
    // Fail-closed: без сконфигурированного секрета вебхук полностью отключён.
    if (!secret || secret.trim() === "") {
      throw new NotFoundException("webhook not configured");
    }
    if (
      !body?.invoiceId ||
      !body?.paymentRef ||
      !body?.signature ||
      body.signature !== secret
    ) {
      throw new NotFoundException("webhook not found");
    }
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: body.invoiceId },
    });
    if (!invoice) throw new NotFoundException("invoice not found");
    if (invoice.status === "PAID") return { status: "PAID" };
    const ref1c = invoiceNumber(invoice.number);
    await this.billing.topup(
      invoice.tenantId,
      ref1c,
      invoice.sumWithVat,
      `kaspi ${body.paymentRef}`
    );
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paymentRef: body.paymentRef, paidAt: new Date() },
    });
    return { status: "PAID" };
  }

  // ADR-027: dual-scope list
  async list(tenantId: string, legalEntityId: string) {
    const rows = await this.prisma.invoice.findMany({
      where: { tenantId, legalEntityId },
      orderBy: { createdAt: "desc" },
    });
    return { items: rows.map((r) => this.view(r)) };
  }

  private view(inv: {
    id: string;
    number: number;
    date: Date;
    productGroup: string;
    quantity: number;
    unitPrice: bigint;
    sumWithoutVat: bigint;
    vat: bigint;
    sumWithVat: bigint;
    status: string;
    paymentRef: string | null;
    paidAt: Date | null;
    vatRatePct: number;
  }) {
    return {
      id: inv.id,
      number: invoiceNumber(inv.number),
      date: inv.date.toISOString(),
      productGroup: inv.productGroup,
      quantity: inv.quantity,
      unitPrice: inv.unitPrice.toString(),
      sumWithoutVat: inv.sumWithoutVat.toString(),
      vat: inv.vat.toString(),
      sumWithVat: inv.sumWithVat.toString(),
      status: inv.status,
      paymentRef: inv.paymentRef,
      paidAt: inv.paidAt?.toISOString() ?? null,
      vatRatePct: inv.vatRatePct,
      paymentUrl: `https://pay.kaspi.kz/mf/${inv.number}`,
    };
  }
}
