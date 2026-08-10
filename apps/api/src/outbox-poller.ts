import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import {
  INktAdapter,
  NKT_ADAPTER,
  IMptAdapter,
  MPT_ADAPTER,
} from "./integrations";
import { BillingService } from "./billing.service";

// OutboxPoller: асинхронные интеграции.
// 1) nkt-register (T3): Approved → Registering → Registered (НКТ).
// 2) send-order-to-mpt (W3, тикет 02): Queued → Sent (POST /api/orders в симулятор ИС МПТ),
//    затем поллинг статусов (ORD-029, поллер=сверка): READY → Completed; REJECTED →
//    Rejected + RELEASE + задача; PENDING дольше MPT_ORDER_TIMEOUT_MS → Failed + RELEASE + задача.
@Injectable()
export class OutboxPoller implements OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
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
    } catch (e) {
      // поллер фоновый: падение не должно становиться unhandled-rejection
      // (например, prisma закрыт при остановке приложения)
      void e;
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

  // Queued → Sent: idempotent по orderId (симулятор сам идемпотентен)
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
    };
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
    await this.mpt.createOrder({
      orderId: order.id,
      tenantId: order.tenantId,
      gtin: order.gtin ?? "",
      quantity: payload.quantity ?? 0,
      serialNumberType: "OPERATOR",
      cisType: "UNIT",
      isPaid: order.isPaid,
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
        }
        return;
      }
      if (order.status !== "COMPLETED") {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: "COMPLETED" },
        });
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
}
