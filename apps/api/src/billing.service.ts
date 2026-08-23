import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";

const RESERVE_KINDS = ["TOPUP", "RESERVE", "RELEASE", "SETTLE"] as const;
type LedgerKind = (typeof RESERVE_KINDS)[number];

// db — PrismaClient или TransactionClient (для одной транзакции заказ+резерв)
type Db = PrismaService | Prisma.TransactionClient;

export interface BalanceView {
  balance: bigint;
  reserved: bigint;
  available: bigint;
}

// Билллинг (ADR-007): double-entry через LedgerEntry; Account.balance = кэш,
// источник истины — проводки. Резерв — optimistic CAS на Account.version
// (UPDATE ... WHERE id=? AND version=?), портабельно SQLite↔PG, без FOR UPDATE.
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private async getAccount(db: Db, tenantId: string, legalEntityId?: string) {
    // ADR-027: предпочтён счёт с заполненным юрлицом (NOT NULL для проводок)
    const scoped = await db.account.findFirst({
      where: legalEntityId
        ? { tenantId, legalEntityId }
        : { tenantId, legalEntityId: { not: null } },
    });
    if (scoped) return scoped;
    const account = await db.account.findFirst({
      where: { tenantId },
    });
    if (!account) throw new NotFoundException("account not found");
    return account;
  }

  private async activeReserve(db: Db, tenantId: string): Promise<bigint> {
    const rows = await db.ledgerEntry.findMany({
      where: { tenantId, kind: { in: ["RESERVE", "RELEASE"] } },
      select: { kind: true, amount: true },
    });
    return rows.reduce((acc, r) => {
      const amount = BigInt(r.amount);
      return r.kind === "RESERVE" ? acc + amount : acc - amount;
    }, BigInt(0));
  }

  private async balanceOf(db: Db, tenantId: string): Promise<bigint> {
    const rows = await db.ledgerEntry.findMany({
      where: { tenantId, kind: { in: ["TOPUP", "SETTLE"] } },
      select: { kind: true, amount: true },
    });
    return rows.reduce((acc, r) => {
      const amount = BigInt(r.amount);
      return r.kind === "TOPUP" ? acc + amount : acc - amount;
    }, BigInt(0));
  }

  async getBalance(tenantId: string): Promise<BalanceView> {
    const reserved = await this.activeReserve(this.prisma, tenantId);
    const balance = await this.balanceOf(this.prisma, tenantId);
    return { balance, reserved, available: balance - reserved };
  }

  // UI-06c: журнал проводок (desc) с «балансом после операции».
  // Баланс считаем кумулятивно по хронологии (asc): TOPUP +, SETTLE −,
  // RESERVE/RELEASE баланс не меняют (влияют только на reserved).
  async ledger(tenantId: string) {
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
    });
    let running = BigInt(0);
    const balanceAfter = new Map<string, bigint>();
    for (const r of rows) {
      const amount = BigInt(r.amount);
      if (r.kind === "TOPUP") running += amount;
      else if (r.kind === "SETTLE") running -= amount;
      balanceAfter.set(r.id, running);
    }
    const items = [...rows]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((r) => ({
        id: r.id,
        date: r.createdAt.toISOString(),
        kind: r.kind,
        amount: BigInt(r.amount).toString(),
        ref1c: r.ref1c ?? null,
        refOrderId: r.refOrderId ?? null,
        reason: r.reason ?? null,
        balance: (balanceAfter.get(r.id) ?? BigInt(0)).toString(),
      }));
    return { items };
  }

  // CAS-обновление: повтор до 3 раз с backoff; конфликт версии → 409.
  // Один вызов = одна проводка + атомарный баланс. checkAvailable вызывается
  // ВНУТРИ каждой итерации (после CAS-конфликта), чтобы concurrent-резервы
  // видели уже записанные RESERVE (сериализация через version bump).
  private async applyOn(
    db: Db,
    tenantId: string,
    kind: LedgerKind,
    amount: bigint,
    opts: {
      refOrderId?: string;
      ref1c?: string;
      reason?: string;
      legalEntityId?: string;
      delta: bigint;
      checkAvailable?: (balance: bigint, reserved: bigint) => boolean;
    }
  ): Promise<{
    entry: { id: string; kind: string; amount: bigint };
    balance: bigint;
  }> {
    if (!RESERVE_KINDS.includes(kind)) {
      throw new BadRequestException(`invalid ledger kind: ${kind}`);
    }
    // ADR-027: prefer account matching the specified legal entity
    const account = await this.getAccount(db, tenantId, opts.legalEntityId);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const current = await db.account.findUnique({
          where: { id: account.id },
        });
        if (!current) throw new NotFoundException("account not found");
        // единственный уникальный ref1c: повторный TOPUP должен вернуть старую проводку
        const existing =
          opts.ref1c && kind === "TOPUP"
            ? await db.ledgerEntry.findUnique({
                where: { ref1c: opts.ref1c },
              })
            : null;
        if (existing) {
          return {
            entry: {
              id: existing.id,
              kind: existing.kind,
              amount: BigInt(existing.amount),
            },
            balance: await this.balanceOf(db, tenantId),
          };
        }
        // C-05: идемпотентность проводок с refOrderId — ровно одна (RESERVE/RELEASE/SETTLE)
        // на заказ. Повторный вызов возвращает существующую проводку, НЕ списывает дважды.
        const existingByIdentity =
          opts.refOrderId !== undefined
            ? await db.ledgerEntry.findFirst({
                where: { tenantId, kind, refOrderId: opts.refOrderId },
              })
            : null;
        if (existingByIdentity) {
          return {
            entry: {
              id: existingByIdentity.id,
              kind: existingByIdentity.kind,
              amount: BigInt(existingByIdentity.amount),
            },
            balance: await this.balanceOf(db, tenantId),
          };
        }
        if (opts.checkAvailable) {
          const reserved = await this.activeReserve(db, tenantId);
          const balance = current.balance;
          if (!opts.checkAvailable(balance, reserved)) {
            throw new HttpException(
              {
                code: 402,
                message: "insufficient funds",
                details: {
                  balance: String(balance),
                  reserved: String(reserved),
                },
                fieldErrors: {},
                correlationId: "",
                retryable: false,
              },
              HttpStatus.PAYMENT_REQUIRED
            );
          }
        }
        const nextBalance = current.balance + opts.delta;
        const updated = await db.account.updateMany({
          where: { id: account.id, version: current.version },
          data: { balance: nextBalance, version: { increment: 1 } },
        });
        if (updated.count === 0) {
          // CAS-конфликт — повторить с новым version (и пересчитать available)
          if (attempt < 2) {
            await this.sleep(10 * (attempt + 1));
            continue;
          }
          throw new ConflictException({
            code: 409,
            message: "conflict, retry later",
            details: null,
            fieldErrors: {},
            correlationId: "",
            retryable: true,
          });
        }
        const entry = await db.ledgerEntry.create({
          data: {
            tenantId,
            // ADR-027: проводка наследует юрлицо своего счёта (composite FK)
            legalEntityId: account.legalEntityId,
            accountId: account.id,
            kind,
            amount,
            refOrderId: opts.refOrderId ?? null,
            ref1c: opts.ref1c ?? null,
            reason: opts.reason ?? null,
          },
        });
        return {
          entry: {
            id: entry.id,
            kind: entry.kind,
            amount: BigInt(entry.amount),
          },
          balance: nextBalance,
        };
      } catch (e) {
        if (e instanceof HttpException || e instanceof ConflictException)
          throw e;
        // уникальный ref1c нарушен конкурентным повтором — вернуть существующий
        if (opts.ref1c && (e as { code?: string }).code === "P2002") {
          const existing = await db.ledgerEntry.findUnique({
            where: { ref1c: opts.ref1c },
          });
          if (existing) {
            return {
              entry: {
                id: existing.id,
                kind: existing.kind,
                amount: BigInt(existing.amount),
              },
              balance: await this.balanceOf(db, tenantId),
            };
          }
        }
        // C-05: гонка двух процессов на (refOrderId, kind) → unique → вернуть existing
        if (
          opts.refOrderId !== undefined &&
          (e as { code?: string }).code === "P2002"
        ) {
          const existing = await db.ledgerEntry.findFirst({
            where: { tenantId, kind, refOrderId: opts.refOrderId },
          });
          if (existing) {
            return {
              entry: {
                id: existing.id,
                kind: existing.kind,
                amount: BigInt(existing.amount),
              },
              balance: await this.balanceOf(db, tenantId),
            };
          }
        }
        throw e;
      }
    }
    throw new ServiceUnavailableException("billing apply failed");
  }

  private async apply(
    tenantId: string,
    kind: LedgerKind,
    amount: bigint,
    opts: {
      refOrderId?: string;
      ref1c?: string;
      reason?: string;
      legalEntityId?: string;
      delta: bigint;
      checkAvailable?: (balance: bigint, reserved: bigint) => boolean;
    }
  ) {
    return this.applyOn(this.prisma, tenantId, kind, amount, opts);
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // TOPUP: пополнение файлом «из 1С», идемпотентно по ref1c (ADR-010)
  async topup(
    tenantId: string,
    legalEntityId: string | undefined,
    ref1c: string,
    amount: bigint,
    reason?: string
  ) {
    if (!ref1c) throw new BadRequestException("ref1c required");
    if (amount <= BigInt(0))
      throw new BadRequestException("amount must be positive");
    const existing = await this.prisma.ledgerEntry.findUnique({
      where: { ref1c },
    });
    if (existing) {
      return {
        entry: {
          id: existing.id,
          kind: existing.kind,
          amount: BigInt(existing.amount),
        },
        existing: true,
      };
    }
    const result = await this.apply(tenantId, "TOPUP", amount, {
      ref1c,
      reason,
      legalEntityId,
      delta: amount,
    });
    return { entry: result.entry, existing: false };
  }

  // RESERVE: блокирует available (balance не трогает). Недостаточно → 402.
  // Уникален по (orderId, kind) — повтор идемпотентен (AT-07).
  // Проверка available — ВНУТРИ CAS-цикла (сериализация через version bump).
  async reserve(
    tenantId: string,
    orderId: string,
    amount: bigint,
    reason?: string
  ) {
    return this.reserveOn(this.prisma, tenantId, orderId, amount, reason);
  }

  // резерв внутри интерактивной транзакции (заказ + RESERVE + outbox одной транзакцией).
  // Идемпотентен: повтор (refOrderId, kind) → существующая проводка (в applyOn).
  async reserveOn(
    db: Db,
    tenantId: string,
    orderId: string,
    amount: bigint,
    reason?: string
  ) {
    if (amount <= BigInt(0))
      throw new BadRequestException("amount must be positive");
    const result = await this.applyOn(db, tenantId, "RESERVE", amount, {
      refOrderId: orderId,
      reason,
      delta: BigInt(0),
      checkAvailable: (balance, reserved) => balance - reserved >= amount,
    });
    return result.entry;
  }

  // RELEASE: компенсация резерва (BILL-019) — уменьшает активный резерв.
  // Идемпотентен: повторный RELEASE того же orderId возвращает существующую
  // проводку и НЕ создаёт вторую (иначе available инфлейтится).
  async release(tenantId: string, orderId: string, reason?: string) {
    return this.releaseOn(this.prisma, tenantId, orderId, reason);
  }

  // RELEASE внутри транзакции (C-05: атомарный финальный сеттлмент).
  async releaseOn(db: Db, tenantId: string, orderId: string, reason?: string) {
    const reserve = await db.ledgerEntry.findFirst({
      where: { tenantId, kind: "RESERVE", refOrderId: orderId },
    });
    if (!reserve) throw new NotFoundException("no active reserve for order");
    const result = await this.applyOn(
      db,
      tenantId,
      "RELEASE",
      BigInt(reserve.amount),
      {
        refOrderId: orderId,
        reason: reason ?? "release",
        delta: BigInt(0),
      }
    );
    return result.entry;
  }

  // SETTLE: списание = регистрация нанесения (п.26) — balance −= amount.
  // Ограничено available (balance − активные резервы) — нельзя увести в минус.
  // C-05: идемпотентен по (orderId, kind) — повтор возвращает ту же проводку.
  async settle(
    tenantId: string,
    orderId: string,
    amount: bigint,
    reason?: string
  ) {
    return this.settleOn(this.prisma, tenantId, orderId, amount, reason);
  }

  // SETTLE внутри интерактивной транзакции (C-05: атомарный финальный сеттлмент).
  async settleOn(
    db: Db,
    tenantId: string,
    orderId: string,
    amount: bigint,
    reason?: string
  ) {
    if (amount <= BigInt(0))
      throw new BadRequestException("amount must be positive");
    const result = await this.applyOn(db, tenantId, "SETTLE", amount, {
      refOrderId: orderId,
      reason: reason ?? "settle",
      delta: -amount,
      checkAvailable: (balance, reserved) => balance - reserved >= amount,
    });
    return result.entry;
  }

  // Активный тариф на дату (W5-07: по товарной группе, fallback общий); нет → 409
  async activeTariff(productGroup?: string) {
    const now = new Date();
    const where = {
      validFrom: { lte: now },
      validTo: { gte: now },
    };
    let tariff = null;
    if (productGroup) {
      tariff = await this.prisma.tariff.findFirst({
        where: { ...where, productGroup },
        orderBy: { validFrom: "desc" },
      });
    }
    if (!tariff) {
      tariff = await this.prisma.tariff.findFirst({
        where: { ...where, productGroup: null },
        orderBy: { validFrom: "desc" },
      });
    }
    if (!tariff) {
      throw new ConflictException({
        code: 409,
        message: "тариф не настроен",
        details: null,
        fieldErrors: {},
        correlationId: "",
        retryable: false,
      });
    }
    return tariff;
  }
}
