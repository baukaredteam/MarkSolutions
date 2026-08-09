import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { INktAdapter, NKT_ADAPTER } from "./integrations";

// Асинхронная регистрация карточки в НКТ (Q5): Approved → Registering → Registered.
// OutboxPoller забирает события aggregate="nkt-register", вызывает submitProduct,
// затем опрашивает getStatus с интервалом. SLA = NKT_SLA_MS (по умолчанию 3 сек).
// Timeout → outbox.status = FAILED → попадает в /moderation/exceptions (ID-017).
// Отказ НКТ → Registration Failed + field-ошибки → карточка в Needs Correction.
@Injectable()
export class OutboxPoller implements OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NKT_ADAPTER) private readonly nkt: INktAdapter
  ) {}

  // читаем env на каждом тике — конфиг-флаги можно менять без перезапуска
  // (в проде они стабильны; в тестах это позволяет проверять сценарии)
  private get pollMs(): number {
    return Number(process.env.OUTBOX_POLL_MS ?? 1000);
  }
  private get timeoutMs(): number {
    return Number(process.env.NKT_TIMEOUT_MS ?? 15000);
  }
  private get requireGs1Verified(): boolean {
    return process.env.REQUIRE_GS1_VERIFIED_FOR_REGISTERING === "true";
  }

  start() {
    if (this.timer) return;
    // интервал пересоздаём каждый тик, чтобы подхватывать изменения pollMs
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
    const rows = await this.prisma.outbox.findMany({
      where: { aggregate: "nkt-register", status: "PENDING" },
      take: 20,
    });
    for (const row of rows) {
      await this.process(row.id).catch((e) => {
        void e;
      });
    }
  }

  private async process(outboxId: string): Promise<void> {
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

    // REQUIRE_GS1_VERIFIED_FOR_REGISTERING: нужен VERIFIED GTIN (seed/manual)
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

    // первый проход: submitProduct → Registering
    if (!payload.startedAt) {
      const attrs = (card.attributes as Record<string, unknown>) ?? {};
      const sub = await this.nkt.submitProduct({
        gtin: card.gtin ?? "",
        brand: String(attrs.brand ?? ""),
        name: String(attrs.name ?? ""),
        tnved: String(attrs.tnved ?? ""),
        // тест-хук: из атрибутов карточки можно форсировать отказ/зависание НКТ
        nktResult:
          (attrs as { nktResult?: "reject" | "hang" }).nktResult ?? undefined,
      });
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: {
          payload: { ...payload, startedAt: Date.now(), ref: sub.ref },
        },
      });
      if (card.status !== "REGISTERING") {
        await this.prisma.productCard.update({
          where: { id: card.id },
          data: { status: "REGISTERING" },
        });
      }
      return;
    }

    // SLA-таймаут → FAILED (ID-017)
    if (Date.now() - payload.startedAt > this.timeoutMs) {
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { status: "FAILED" },
      });
      return;
    }

    // опрос статуса НКТ
    const st = await this.nkt.getStatus(String(payload.ref));
    if (st.status === "REGISTERED") {
      await this.prisma.productCard.update({
        where: { id: card.id },
        data: {
          status: "REGISTERED",
          ntin: st.ntin,
          gtin: st.gtin,
        },
      });
      await this.prisma.outbox.update({
        where: { id: outboxId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
      return;
    }
    if (st.status === "REJECTED") {
      // Registration Failed + field-level ошибки → Needs Correction
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
    // PROCESSING — ждём следующий тик
  }
}
