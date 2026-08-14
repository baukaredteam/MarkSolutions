import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "./prisma.service";
import {
  INktAdapter,
  NKT_ADAPTER,
  IMptAdapter,
  MPT_ADAPTER,
} from "./integrations";
import { BillingService } from "./billing.service";
import { VaultService } from "./vault.service";
import { UtilisationService } from "./utilisation.service";
import { CodeEventService } from "./code-event.service";

// OutboxPoller: асинхронные интеграции.
// 1) nkt-register (T3): Approved → Registering → Registered (НКТ).
// 2) send-order-to-mpt (W3, тикет 02): Queued → Sent (POST /api/orders в симулятор ИС МПТ),
//    затем поллинг статусов (ORD-029, поллер=сверка): READY → Completed; REJECTED →
//    Rejected + RELEASE + задача; PENDING дольше MPT_ORDER_TIMEOUT_MS → Failed + RELEASE + задача.
// 3) инджест кодов в Code Vault (W3, тикет 04): COMPLETED/PARTIALLY → GET /api/codes из симулятора → Vault.
@Injectable()
export class OutboxPoller implements OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly vault: VaultService,
    private readonly utilisation: UtilisationService,
    private readonly events: CodeEventService,
    @Inject(NKT_ADAPTER) private readonly nkt: INktAdapter,
    @Inject(MPT_ADAPTER) private readonly mpt: IMptAdapter
  ) {}

  // читаем env на каждом тике — конфиг-флаги можно менять без перезапуска
  private get pollMs(): number {
    return Number(process.env.OUTBOX_POLL_MS ?? 1000);
  }
  private get timeoutMs(): number {
    return Number(process.env.NKT_TIMEOUT_MS ?? 15000);
  }
  private get mptPollMs(): number {
    return Number(process.env.MPT_POLL_MS ?? 2000);
  }
  private get mptTimeoutMs(): number {
    return Number(process.env.MPT_ORDER_TIMEOUT_MS ?? 60000);
  }
  private get requireGs1Verified(): boolean {
    return process.env.REQUIRE_GS1_VERIFIED_FOR_REGISTERING === "true";
  }

  start() {
    if (this.timer) return;
    const tick = () => {
      void this.poll().finally(() => {
        if (this.timer !== null) {
          clearTimeout(this.timer);
          this.timer = setTimeout(tick, this.pollMs);
        }
      });
    };
    this.timer = setTimeout(tick, this.pollMs);
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async poll(): Promise<void> {
    try {
      // 1) регистрация карточки в НКТ (T3)
      const nktRows = await this.prisma.outbox.findMany({
        where: { aggregate: "nkt-register", status: "PENDING" },
        take: 20,
      });
      for (const row of nktRows) {
        await this.processNkt(row.id).catch(() => {});
      }
      // 2) заказы КМ (W3): отправить новые, догнать статусы, таймауты
      await this.pollMptOrders();
      // 3) документы ИС МПТ (C-03, тикет MPT-02): import/withdrawal async state machine
      await this.pollDocuments();
      // 4) отчёты о нанесении (W3, п.26): доводим до SUCCESS/ERROR
      await this.utilisation.pollReports();
      // 5) таймер 30 дней (п.25, ADR-012): алерты 7/3/1 + аннулирование EXPIRED
      await this.pollUtilisationDeadlines();
    } catch (e) {
      // поллер фоновый: падение не должно становиться unhandled-rejection
      // (например, prisma закрыт при остановке приложения)
      void e;
    }
  }

  // ---- Таймер 30 дней (п.25, ADR-012): дедлайн = данные (конфиг), отсчёт от даты получения КМ ----
  private get deadlineDays(): number {
    return Number(process.env.UTIL_DEADLINE_DAYS ?? 30);
  }

  private async pollUtilisationDeadlines(): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] } },
      take: 50,
    });
    for (const order of orders) {
      // отсчёт от updatedAt (дата получения/обновления КМ)
      const days = Math.floor(
        (Date.now() - order.updatedAt.getTime()) / 86400000
      );
      const daysLeft = this.deadlineDays - days;
      // алерты 7/3/1
      if (daysLeft === 7 || daysLeft === 3 || daysLeft === 1) {
        const existing = await this.prisma.utilisationAlert.findFirst({
          where: { orderId: order.id, daysLeft },
        });
        if (!existing) {
          await this.prisma.utilisationAlert.create({
            data: {
              tenantId: order.tenantId,
              orderId: order.id,
              daysLeft,
              kind: "alert",
            },
          });
          await this.prisma.outbox.create({
            data: {
              aggregate: "mpt-order-timeout",
              status: "FAILED",
              payload: {
                orderId: order.id,
                tenantId: order.tenantId,
                reason: `utilisation deadline in ${daysLeft} day(s)`,
              },
            },
          });
        }
      }
      // аннулирование после дедлайна: смена статуса (EXPIRED), не удаление
      if (daysLeft <= 0) {
        const active = await this.prisma.codeVault.count({
          where: { orderId: order.id, status: { not: "EXPIRED" } },
        });
        if (active > 0) {
          await this.prisma.codeVault.updateMany({
            where: { orderId: order.id },
            data: { status: "EXPIRED" },
          });
          await this.prisma.utilisationAlert.create({
            data: {
              tenantId: order.tenantId,
              orderId: order.id,
              daysLeft: 0,
              kind: "expire",
            },
          });
        }
      }
    }
  }

  // ---- НКТ (без изменений от T3) ----
  private async processNkt(outboxId: string): Promise<void> {
    const row = await this.prisma.outbox.findUnique({
      where: { id: outboxId },
    });
    if (!row || row.status !== "PENDING") return;
    const payload = row.payload as {
      cardId: string;
      gtin?: string;
      tenantId?: string;
      startedAt?: number;
      ref?: string;
    };
    const card = await this.prisma.productCard.findUnique({
      where: { id: payload.cardId },
    });
    if (!card) {
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { status: "FAILED" },
      });
      return;
    }
    if (this.requireGs1Verified && payload.gtin) {
      const cached = await this.prisma.gtinCache.findUnique({
        where: { gtin: payload.gtin },
      });
      if (!cached || cached.status !== "VERIFIED") {
        await this.prisma.outbox.update({
          where: { id: outboxId },
          data: { status: "FAILED" },
        });
        return;
      }
    }
    if (!payload.startedAt) {
      const attrs = (card.attributes as Record<string, unknown>) ?? {};
      const sub = await this.nkt.submitProduct({
        gtin: card.gtin ?? "",
        brand: String(attrs.brand ?? ""),
        name: String(attrs.name ?? ""),
        tnved: String(attrs.tnved ?? ""),
        nktResult:
          (attrs as { nktResult?: "reject" | "hang" }).nktResult ?? undefined,
      });
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { payload: { ...payload, startedAt: Date.now(), ref: sub.ref } },
      });
      if (card.status !== "REGISTERING") {
        await this.prisma.productCard.update({
          where: { id: card.id },
          data: { status: "REGISTERING" },
        });
      }
      return;
    }
    if (Date.now() - payload.startedAt > this.timeoutMs) {
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { status: "FAILED" },
      });
      return;
    }
    const st = await this.nkt.getStatus(String(payload.ref));
    if (st.status === "REGISTERED") {
      await this.prisma.productCard.update({
        where: { id: card.id },
        data: { status: "REGISTERED", ntin: st.ntin, gtin: st.gtin },
      });
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      return;
    }
    if (st.status === "REJECTED") {
      await this.prisma.productCard.update({
        where: { id: card.id },
        data: { status: "NEEDS_CORRECTION", fieldReasons: st.fieldErrors },
      });
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { status: "FAILED" },
      });
      return;
    }
  }

  // ---- ИС МПТ (W3) ----
  private async pollMptOrders(): Promise<void> {
    // (a) отправить новые: PENDING send-order-to-mpt → POST /api/orders → Sent
    const sends = await this.prisma.outbox.findMany({
      where: { aggregate: "send-order-to-mpt", status: "PENDING" },
      take: 20,
    });
    for (const row of sends) {
      await this.sendToMpt(row.id).catch(() => {});
    }

    // (b) догнать статусы незакрытых заказов (Sent/Processing/Partially)
    const orders = await this.prisma.order.findMany({
      where: { status: { in: ["SENT", "PROCESSING", "PARTIALLY_COMPLETED"] } },
      take: 50,
    });
    for (const order of orders) {
      await this.reconcileOrder(order.id).catch(() => {});
    }
  }

  // Queued → Sent: idempotent по orderId (симулятор сам идемпотентен).
  // Корреляция (аудит C-01): correlationId + attempt пишутся в payload ДО вызова
  // внешнего API, requestId (из адаптера) — после. Полные трассы — в audit/outbox.
  private async sendToMpt(outboxId: string): Promise<void> {
    const row = await this.prisma.outbox.findUnique({
      where: { id: outboxId },
    });
    if (!row || row.status !== "PENDING") return;
    const payload = row.payload as {
      orderId: string;
      tenantId?: string;
      gtin?: string;
      quantity?: number;
      correlationId?: string;
      attempt?: number;
      requestId?: string | null;
    };
    const correlationId = payload.correlationId ?? randomUUID();
    const attempt = (payload.attempt ?? 0) + 1;
    await this.prisma.outbox.update({
      where: { id: outboxId },
      data: { payload: { ...payload, correlationId, attempt } },
    });
    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
    });
    if (!order || order.status === "CANCELLED") {
      // Cancelled-заказ не отправляем и не эмитируем (стоп-тест)
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      return;
    }
    let res;
    try {
      res = await this.mpt.createOrder({
        orderId: order.id,
        tenantId: order.tenantId,
        gtin: order.gtin ?? "",
        quantity: payload.quantity ?? 0,
        serialNumberType: "OPERATOR",
        cisType: "UNIT",
        isPaid: order.isPaid,
      });
    } catch (e) {
      // постоянная ошибка внешнего API (4xx/конфиг): ретрай бесполезен →
      // outbox FAILED + задача оператору (ID-017). Временные (5xx/network)
      // бросаем дальше: поллер оставит PENDING для reconciliation.
      if ((e as { permanent?: boolean }).permanent) {
        await this.prisma.outbox.update({
          where: { id: outboxId },
          data: { status: "FAILED" },
        });
        await this.prisma.outbox.create({
          data: {
            aggregate: "mpt-order-timeout",
            status: "FAILED",
            payload: {
              orderId: payload.orderId,
              tenantId: order.tenantId,
              reason: `mpt permanent error: ${String((e as Error).message)}`,
            },
          },
        });
        return;
      }
      throw e;
    }
    await this.prisma.outbox.update({
      where: { id: outboxId },
      data: {
        payload: {
          ...payload,
          correlationId,
          attempt,
          requestId: res.requestId ?? null,
        },
      },
    });
    // повторная проверка: отмена могла выиграть гонку (at-least-once) — не отправляем SENT
    const fresh = await this.prisma.order.findUnique({
      where: { id: order.id },
    });
    if (fresh?.status === "CANCELLED") {
      await this.prisma.mptOrder.deleteMany({
        where: { externalId: order.id },
      });
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      return;
    }
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: "SENT" },
    });
    await this.prisma.outbox.update({
      where: { id: outboxId },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
  }

  // ORD-029: поллер=сверка — догоняет статусы по всем незакрытым
  private async reconcileOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) return;
    const mpt = await this.mpt.getOrder(orderId);
    const now = Date.now();
    const age = now - order.updatedAt.getTime();
    // количество заказа — из OrderLine (на Order колонки quantity нет)
    const expectedQty = order.lines.reduce((s, l) => s + l.quantity, 0);

    // таймаут: PENDING дольше MPT_ORDER_TIMEOUT_MS → Failed + RELEASE + задача (ID-017)
    if (age > this.mptTimeoutMs) {
      if (order.status !== "FAILED") {
        await this.billing
          .release(order.tenantId, orderId, "mpt order timeout")
          .catch(() => {});
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: "FAILED" },
        });
        await this.prisma.outbox.create({
          data: {
            aggregate: "mpt-order-timeout",
            status: "FAILED",
            payload: {
              orderId,
              tenantId: order.tenantId,
              mptStatus: mpt.status,
            },
          },
        });
      }
      return;
    }

    if (mpt.status === "READY" || mpt.status === "CLOSED") {
      // расхождение количества: мок-шов (quantity−1 кодов) → Partially Completed + задача
      const codes = await this.mpt.getCodes(orderId);
      if (codes.codes.length < expectedQty) {
        if (order.status !== "PARTIALLY_COMPLETED") {
          await this.prisma.order.update({
            where: { id: orderId },
            data: { status: "PARTIALLY_COMPLETED" },
          });
          await this.prisma.outbox.create({
            data: {
              aggregate: "mpt-order-timeout",
              status: "FAILED",
              payload: {
                orderId,
                tenantId: order.tenantId,
                reason: "quantity mismatch",
                expected: expectedQty,
                actual: codes.codes.length,
              },
            },
          });
          // инджест: сколько пришло (PARTIALLY) — в Vault
          await this.vault.ingest(orderId, codes.codes, order.cardId);
        }
        return;
      }
      if (order.status !== "COMPLETED") {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: "COMPLETED" },
        });
        // инджест всех кодов в Vault (граница с тикетом 03)
        await this.vault.ingest(orderId, codes.codes, order.cardId);
      }
      return;
    }
    if (mpt.status === "REJECTED") {
      if (order.status !== "REJECTED") {
        await this.billing
          .release(order.tenantId, orderId, "mpt order rejected")
          .catch(() => {});
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: "REJECTED" },
        });
        await this.prisma.outbox.create({
          data: {
            aggregate: "mpt-order-timeout",
            status: "FAILED",
            payload: {
              orderId,
              tenantId: order.tenantId,
              reason: "mpt rejected",
            },
          },
        });
      }
      return;
    }
    // PENDING — ждём следующий тик
  }

  // ---- Документы ИС МПТ (C-03, тикет MPT-02): async state machine ----
  // SUBMITTED → mpt.getDocument(externalDocumentId) → SUCCESS (локальные CodeEvent
  // + статусы Vault в ОДНОЙ транзакции с claim) / ERROR / таймаут → задача оператору.
  // Без вечного зависания: permanent-ошибка адаптера, внешний ERROR и превышение
  // DOC_TIMEOUT_MS переводят документ в ERROR + mpt-order-timeout (ID-017).
  private async pollDocuments(): Promise<void> {
    const imports = await this.prisma.importDocument.findMany({
      where: { status: "SUBMITTED" },
      take: 20,
    });
    for (const doc of imports) {
      await this.reconcileImport(doc.id).catch(() => {});
    }
    const withdrawals = await this.prisma.withdrawalDocument.findMany({
      where: { status: "SUBMITTED" },
      take: 20,
    });
    for (const doc of withdrawals) {
      await this.reconcileWithdrawal(doc.id).catch(() => {});
    }
  }

  private get docTimeoutMs(): number {
    return Number(process.env.DOC_TIMEOUT_MS ?? 600000);
  }

  private async failImport(
    doc: { id: string; orderId: string; tenantId: string },
    reason: string
  ): Promise<void> {
    await this.prisma.importDocument.update({
      where: { id: doc.id },
      data: { status: "ERROR", rejectReason: reason },
    });
    await this.prisma.outbox.create({
      data: {
        aggregate: "mpt-order-timeout",
        status: "FAILED",
        payload: { orderId: doc.orderId, tenantId: doc.tenantId, reason },
      },
    });
  }

  private async failWithdrawal(
    doc: { id: string; tenantId: string },
    reason: string
  ): Promise<void> {
    await this.prisma.withdrawalDocument.update({
      where: { id: doc.id },
      data: { status: "ERROR", rejectReason: reason },
    });
    await this.prisma.outbox.create({
      data: {
        aggregate: "mpt-order-timeout",
        status: "FAILED",
        payload: { tenantId: doc.tenantId, reason, documentId: doc.id },
      },
    });
  }

  private async reconcileImport(docId: string): Promise<void> {
    const doc = await this.prisma.importDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.status !== "SUBMITTED" || !doc.externalDocumentId) return;
    let st: Awaited<ReturnType<IMptAdapter["getDocument"]>>;
    try {
      st = await this.mpt.getDocument(doc.externalDocumentId);
    } catch (e) {
      // 404/4xx реального адаптера — permanent: документ ERROR + задача, не зависаем
      if ((e as { permanent?: boolean }).permanent) {
        await this.failImport(
          doc,
          `import failed: ${String((e as Error).message)}`
        );
      }
      // временная ошибка — следующий тик
      return;
    }
    if (st.status === "SUCCESS") {
      try {
        await this.prisma.$transaction(async (tx) => {
          // claim: ровно один poller завершает документ (гонка двух процессов)
          const claimed = await tx.importDocument.updateMany({
            where: { id: docId, status: "SUBMITTED" },
            data: { status: "SUCCESS" },
          });
          if (claimed.count === 0) return;
          const codes = await tx.codeVault.findMany({
            where: { orderId: doc.orderId, tenantId: doc.tenantId },
          });
          for (const c of codes) {
            await this.events.recordEventOn(
              tx,
              doc.tenantId,
              c.id,
              "system",
              "INTRODUCED"
            );
          }
        });
      } catch (e) {
        // poison pill: код изменил статус (недопустимый переход) — терминально
        if (
          e instanceof BadRequestException ||
          e instanceof NotFoundException
        ) {
          await this.failImport(
            doc,
            `import finalize: ${String((e as Error).message)}`
          );
        }
        // иначе — retry следующий тик
      }
      return;
    }
    if (st.status === "ERROR") {
      await this.failImport(doc, st.rejectReason ?? "import rejected");
      return;
    }
    // IN_PROCESS: внешний документ не завершился в срок → ERROR + задача
    if (Date.now() - doc.createdAt.getTime() > this.docTimeoutMs) {
      await this.failImport(
        doc,
        "import timeout (внешний документ не завершился)"
      );
    }
  }

  private async reconcileWithdrawal(docId: string): Promise<void> {
    const doc = await this.prisma.withdrawalDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.status !== "SUBMITTED" || !doc.externalDocumentId) return;
    let st: Awaited<ReturnType<IMptAdapter["getDocument"]>>;
    try {
      st = await this.mpt.getDocument(doc.externalDocumentId);
    } catch (e) {
      if ((e as { permanent?: boolean }).permanent) {
        await this.failWithdrawal(
          doc,
          `withdrawal failed: ${String((e as Error).message)}`
        );
      }
      return;
    }
    if (st.status === "SUCCESS") {
      try {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.withdrawalDocument.updateMany({
            where: { id: docId, status: "SUBMITTED" },
            data: { status: "SUCCESS" },
          });
          if (claimed.count === 0) return;
          const codes = (doc.codes as string[]) ?? [];
          const units = (doc.aggregateUnits as string[] | null) ?? [];
          for (const unitId of units) {
            await tx.aggregationUnit.update({
              where: { id: unitId },
              data: { status: "DISAGGREGATED" },
            });
          }
          for (const codeKey of codes) {
            if (units.length > 0) {
              const memberUnit = await tx.aggregationMember.findFirst({
                where: { codeKey },
                include: { unit: true },
              });
              if (memberUnit && units.includes(memberUnit.unitId)) {
                await this.events.recordEventOn(
                  tx,
                  doc.tenantId,
                  codeKey,
                  "system",
                  "DISAGGREGATED"
                );
              }
            }
            await this.events.recordEventOn(
              tx,
              doc.tenantId,
              codeKey,
              "system",
              doc.withdrawalType === "WRITE_OFF" ? "WRITTEN_OFF" : "WITHDRAWN",
              {
                reasonCode: doc.withdrawalReason,
                comment: doc.comment ?? null,
              }
            );
          }
        });
      } catch (e) {
        if (
          e instanceof BadRequestException ||
          e instanceof NotFoundException
        ) {
          await this.failWithdrawal(
            doc,
            `withdrawal finalize: ${String((e as Error).message)}`
          );
        }
      }
      return;
    }
    if (st.status === "ERROR") {
      await this.failWithdrawal(doc, st.rejectReason ?? "withdrawal rejected");
      return;
    }
    if (Date.now() - doc.createdAt.getTime() > this.docTimeoutMs) {
      await this.failWithdrawal(
        doc,
        "withdrawal timeout (внешний документ не завершился)"
      );
    }
  }
}
