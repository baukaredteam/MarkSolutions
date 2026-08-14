import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { IMptAdapter, MPT_ADAPTER } from "./integrations";
import { CodeEventService } from "./code-event.service";

// Документы оборота (W4-04, Q5/Q9): импорт (ДТ → INTRODUCED) и вывод
// (WITHDRAWAL→WITHDRAWN, WRITE_OFF→WRITTEN_OFF). Паттерн — utilisation.
const WITHDRAWAL_REASONS = [
  "DEFECT",
  "LOST",
  "EXPIRY",
  "RETURN_SUPPLIER",
  "DESTRUCTION",
  "OTHER",
] as const;
type WithdrawalReason = (typeof WITHDRAWAL_REASONS)[number];

type WithdrawalCode =
  | string
  | {
      code: string;
      partialQuantity?: number;
      aggregation?: { unitId: string };
    };

@Injectable()
export class DocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: CodeEventService,
    @Inject(MPT_ADAPTER) private readonly mpt: IMptAdapter
  ) {}

  // Q5: импорт партии по заказу — все коды APPLIED → INTRODUCED
  async submitImport(
    tenantId: string,
    body: {
      orderId: string;
      customsDeclaration: {
        date?: string;
        number?: string;
        authorityCode?: string;
      };
    }
  ) {
    const cd = body.customsDeclaration ?? {};
    if (!cd.date || !cd.number) {
      throw new BadRequestException(
        "customsDeclaration.date and number are required"
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
    });
    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException("order not found");

    // уникальность ДТ по номеру (tenant-scoped) → 409
    const dup = await this.prisma.importDocument.findUnique({
      where: { tenantId_customsNumber: { tenantId, customsNumber: cd.number } },
    });
    if (dup)
      throw new ConflictException(`ДТ ${cd.number} уже зарегистрирована`);

    // все коды заказа, статус APPLIED
    const codes = await this.prisma.codeVault.findMany({
      where: { orderId: body.orderId, tenantId },
    });
    if (codes.length === 0) throw new NotFoundException("no codes for order");
    const notApplied = codes.find((c) => c.status !== "APPLIED");
    if (notApplied) {
      await this.prisma.importDocument.create({
        data: {
          tenantId,
          orderId: body.orderId,
          customsDate: cd.date,
          customsNumber: cd.number,
          authorityCode: cd.authorityCode ?? null,
          status: "ERROR",
          rejectReason: `code not applied: ${notApplied.id} (${notApplied.status})`,
          submittedAt: new Date(),
        },
      });
      await this.prisma.outbox.create({
        data: {
          aggregate: "mpt-order-timeout",
          status: "FAILED",
          payload: {
            orderId: body.orderId,
            tenantId,
            reason: `import rejected: code ${notApplied.id} not APPLIED`,
          },
        },
      });
      return { status: "ERROR", rejectReason: "code not applied" };
    }

    // submit в симулятор
    const sub = await this.mpt.submitImport({
      tenantId,
      codes: codes.map((c) => c.id),
      customsDate: cd.date,
      customsNumber: cd.number,
      authorityCode: cd.authorityCode,
    });
    if (sub.status === "ERROR") {
      await this.prisma.importDocument.create({
        data: {
          tenantId,
          orderId: body.orderId,
          customsDate: cd.date,
          customsNumber: cd.number,
          authorityCode: cd.authorityCode ?? null,
          status: "ERROR",
          rejectReason: sub.rejectReason ?? "import rejected",
          submittedAt: new Date(),
        },
      });
      await this.prisma.outbox.create({
        data: {
          aggregate: "mpt-order-timeout",
          status: "FAILED",
          payload: {
            orderId: body.orderId,
            tenantId,
            reason: `import rejected: ${sub.rejectReason ?? "unknown"}`,
          },
        },
      });
      return { status: "ERROR", rejectReason: sub.rejectReason };
    }
    // C-03: async state machine — документ SUBMITTED, внешний documentId сохранён,
    // локальные INTRODUCED-события НЕ пишутся до подтверждённого внешнего SUCCESS
    // (поллер OutboxPoller.pollDocuments → mpt.getDocument → транзакция).
    const doc = await this.prisma.importDocument.create({
      data: {
        tenantId,
        orderId: body.orderId,
        customsDate: cd.date,
        customsNumber: cd.number,
        authorityCode: cd.authorityCode ?? null,
        status: "SUBMITTED",
        externalDocumentId: sub.documentId,
        submittedAt: new Date(),
      },
    });
    return { status: "SUBMITTED", documentId: doc.id };
  }

  // Q9: вывод из оборота — WITHDRAWAL→WITHDRAWN, WRITE_OFF→WRITTEN_OFF
  async submitWithdrawal(
    tenantId: string,
    body: {
      codes: WithdrawalCode[];
      withdrawalType: string;
      withdrawalReason: string;
      comment?: string;
      childrenWriteOff?: boolean;
      primaryDocument?: { type?: string; date?: string; number?: string };
    }
  ) {
    const withdrawalType = body.withdrawalType;
    if (withdrawalType !== "WITHDRAWAL" && withdrawalType !== "WRITE_OFF")
      throw new BadRequestException(
        "withdrawalType должен быть WITHDRAWAL|WRITE_OFF"
      );
    if (!WITHDRAWAL_REASONS.includes(body.withdrawalReason as WithdrawalReason))
      throw new BadRequestException(
        `withdrawalReason должен быть ${WITHDRAWAL_REASONS.join("|")}`
      );
    if (
      body.withdrawalReason === "OTHER" &&
      (!body.comment || body.comment.trim().length < 5)
    )
      throw new BadRequestException(
        "для OTHER требуется comment (мин. 5 символов)"
      );
    // partialQuantity не поддерживается в MVP-1
    if (body.codes.some((c) => typeof c === "object" && c.partialQuantity))
      throw new BadRequestException(
        "partialQuantity не поддерживается в MVP-1"
      );

    const codeKeys = body.codes.map((c) =>
      typeof c === "string" ? c : c.code
    );
    const childrenWriteOff = body.childrenWriteOff ?? false;

    // собрать коды: прямой вывод + (childrenWriteOff) члены агрегатов
    const toProcess: string[] = [];
    const unitsToDisaggregate = new Set<string>();

    for (const item of body.codes) {
      const codeKey = typeof item === "string" ? item : item.code;
      // агрегат? (передан unitId в aggregation, или код является агрегатом)
      const aggUnitId =
        typeof item === "object" && item.aggregation
          ? item.aggregation.unitId
          : codeKey;
      const unit = await this.prisma.aggregationUnit.findFirst({
        where: { id: aggUnitId, tenantId },
      });
      if (unit) {
        if (!childrenWriteOff) {
          if (["OPEN", "SEALED"].includes(unit.status)) {
            throw new ConflictException(
              "агрегат активен — требуется childrenWriteOff=true"
            );
          }
        } else {
          unitsToDisaggregate.add(unit.id);
          const members = await this.prisma.aggregationMember.findMany({
            where: { unitId: unit.id },
          });
          for (const m of members) {
            if (!toProcess.includes(m.codeKey)) toProcess.push(m.codeKey);
          }
        }
        continue;
      }
      // обычный код: член активного агрегата в одиночку → 409
      const memberUnit = await this.prisma.aggregationMember.findFirst({
        where: { codeKey, tenantId },
        include: { unit: true },
      });
      if (memberUnit && ["OPEN", "SEALED"].includes(memberUnit.unit.status)) {
        throw new ConflictException(
          "код в активном агрегате — сначала расформирование"
        );
      }
      if (!toProcess.includes(codeKey)) toProcess.push(codeKey);
    }

    // проверить все развёрнутые члены на повторный вывод
    for (const codeKey of toProcess) {
      const code = await this.prisma.codeVault.findFirst({
        where: { id: codeKey, tenantId },
      });
      if (!code) throw new NotFoundException(`code not found: ${codeKey}`);
      if (["WITHDRAWN", "WRITTEN_OFF", "EXPIRED"].includes(code.status))
        throw new ConflictException(
          `код ${codeKey} уже в статусе ${code.status}`
        );
    }

    // C-03: защита от дубля — активный (SUBMITTED) документ с пересечением кодов → 409,
    // иначе те же коды уйдут в ИС МПТ второй раз (повторная отправка).
    const openDocs = await this.prisma.withdrawalDocument.findMany({
      where: { tenantId, status: "SUBMITTED" },
      take: 50,
    });
    const openCodes = new Set<string>();
    for (const d of openDocs) {
      for (const c of (d.codes as string[]) ?? []) openCodes.add(c);
    }
    if (toProcess.some((c) => openCodes.has(c))) {
      throw new ConflictException(
        "вывод уже отправлен (документ в обработке ИС МПТ) — повторная отправка запрещена"
      );
    }

    const sub = await this.mpt.submitWithdrawal({
      tenantId,
      codes: toProcess,
      withdrawalType,
      withdrawalReason: body.withdrawalReason,
      childrenWriteOff,
    });
    if (sub.status === "ERROR") {
      const doc = await this.prisma.withdrawalDocument.create({
        data: {
          tenantId,
          codes: codeKeys,
          withdrawalType,
          withdrawalReason: body.withdrawalReason,
          comment: body.comment ?? null,
          childrenWriteOff,
          primaryDocument: (body.primaryDocument ?? null) as never,
          status: "ERROR",
          rejectReason: sub.rejectReason ?? "withdrawal rejected",
          submittedAt: new Date(),
        },
      });
      void doc;
      return { status: "ERROR", rejectReason: sub.rejectReason };
    }
    // C-03: async state machine — документ SUBMITTED + внешний documentId;
    // локальные WITHDRAWN/WRITTEN_OFF/DISAGGREGATED-события НЕ пишутся до внешнего
    // SUCCESS (поллер OutboxPoller.pollDocuments → mpt.getDocument → транзакция).
    const doc = await this.prisma.withdrawalDocument.create({
      data: {
        tenantId,
        codes: toProcess, // полный набор для событий (включая членов агрегатов)
        withdrawalType,
        withdrawalReason: body.withdrawalReason,
        comment: body.comment ?? null,
        childrenWriteOff,
        primaryDocument: (body.primaryDocument ?? null) as never,
        aggregateUnits:
          unitsToDisaggregate.size > 0 ? [...unitsToDisaggregate] : undefined,
        externalDocumentId: sub.documentId,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
    return { status: "SUBMITTED", documentId: doc.id };
  }

  // GET /documents — EntityList (ADR-008) по всем типам (без SERVICE_ACT_EXPORT: тикет 05)
  async list(tenantId: string) {
    const [imports, withdrawals, utilisations] = await Promise.all([
      this.prisma.importDocument.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.withdrawalDocument.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.utilisationReport.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const items = [
      ...imports.map((d) => ({
        id: d.id,
        type: "IMPORT",
        date: d.submittedAt ?? d.createdAt,
        status: d.status,
        rejectReason: d.rejectReason ?? null,
      })),
      ...withdrawals.map((d) => ({
        id: d.id,
        type: "WITHDRAWAL",
        date: d.submittedAt ?? d.createdAt,
        status: d.status,
        rejectReason: d.rejectReason ?? null,
      })),
      ...utilisations.map((d) => ({
        id: d.id,
        type: "UTILISATION",
        date: d.createdAt,
        status: d.status,
        rejectReason: d.rejectReason ?? null,
      })),
    ];
    // общая сортировка desc по дате (Q10: единый список документов)
    items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    return { items };
  }
}
