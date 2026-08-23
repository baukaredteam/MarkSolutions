import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

describe("billing core (W3, ADR-007)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let accountId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "bill-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.DEMO_ENABLED = "true";
    execSync(
      "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma",
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: testDb.databaseUrl },
        stdio: "pipe",
      }
    );
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const tenant = await prisma.tenant.create({
      data: { bin: "777000111222", name: "БилТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const account = await prisma.account.create({
      data: { tenantId, legalEntityId: "le-" + tenantId, balance: BigInt(0) },
    });
    accountId = account.id;
    // убрать seed-тариф — тест проверяет «нет активного тарифа» сначала
    await prisma.tariff.deleteMany();
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: "u1",
      tenantId,
      roles: ["admin"],
      activeLegalEntityId: "le-" + tenantId,
      mfaCompleted: true,
    });
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  // инвариант ADR-007: balance == SUM(проводок)
  async function assertLedgerInvariant() {
    const entries = await prisma.ledgerEntry.findMany({ where: { tenantId } });
    const total = entries.reduce(
      (acc, e) => {
        if (e.kind === "TOPUP") acc.topup += e.amount;
        if (e.kind === "RESERVE") acc.reserve += e.amount;
        if (e.kind === "RELEASE") acc.release += e.amount;
        if (e.kind === "SETTLE") acc.settle += e.amount;
        return acc;
      },
      {
        topup: BigInt(0),
        reserve: BigInt(0),
        release: BigInt(0),
        settle: BigInt(0),
      }
    );
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });
    // balance = topup - settle; активный резерв = reserve - release
    const expectedBalance = total.topup - total.settle;
    expect(account!.balance).toBe(expectedBalance);
    return total;
  }

  it("PaymentImport (TOPUP) идемпотентно по ref1c — повтор не создаёт второй проводки (ADR-010)", async () => {
    const first = await request(app.getHttpServer())
      .post("/billing/payments/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ ref1c: "PAY-1", amount: 100000, reason: "пополнение 1С" })
      .expect(201);
    expect(first.body.kind).toBe("TOPUP");
    expect(first.body.amount).toBe("100000");

    // повтор того же ref1c → тот же результат, без новой проводки
    const dup = await request(app.getHttpServer())
      .post("/billing/payments/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ ref1c: "PAY-1", amount: 999999, reason: "пополнение 1С" })
      .expect(200);
    expect(dup.body.id).toBe(first.body.id);
    const count = await prisma.ledgerEntry.count({ where: { ref1c: "PAY-1" } });
    expect(count).toBe(1);
    await assertLedgerInvariant();
  });

  it("AT-06: резерв при недостаточном балансе → 402, проводок нет", async () => {
    // изолированный tenant с 0 баланса
    const t = await prisma.tenant.create({
      data: { bin: "777000111333", name: "НольБал", status: "ACTIVE" },
    });
    await prisma.account.create({
      data: { tenantId: t.id, legalEntityId: "le-" + t.id, balance: BigInt(0) },
    });
    const tok = app.get(JwtService).sign({
      sub: `u1`,
      tenantId: t.id,
      roles: ["admin"],
      activeLegalEntityId: "le-" + t.id,
      mfaCompleted: true,
    });
    const res = await request(app.getHttpServer())
      .post("/billing/reserve")
      .set("Authorization", `Bearer ${tok}`)
      .send({ orderId: "o-1", amount: 5000 })
      .expect(402);
    expect(res.body.code).toBe(402);
    const reserve = await prisma.ledgerEntry.count({
      where: { refOrderId: "o-1", kind: "RESERVE" },
    });
    expect(reserve).toBe(0);
    await assertLedgerInvariant();
  });

  it("конкурентный стоп-тест: два параллельных списания на сумму > available → ровно один успех", async () => {
    // изолированный tenant: balance 100000 (через TOPUP — инвариант ledger==balance),
    // два параллельных резерва по 80000
    const t = await prisma.tenant.create({
      data: { bin: "777000111444", name: "КонкТен", status: "ACTIVE" },
    });
    const acc = await prisma.account.create({
      data: { tenantId: t.id, legalEntityId: "le-" + t.id, balance: BigInt(0) },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId: t.id,
        legalEntityId: "le-" + t.id,
        accountId: acc.id,
        kind: "TOPUP",
        amount: BigInt(100000),
        reason: "seed",
      },
    });
    await prisma.account.update({
      where: { id: acc.id },
      data: { balance: BigInt(100000) },
    });
    const tok = app.get(JwtService).sign({
      sub: `u1`,
      tenantId: t.id,
      roles: ["admin"],
      activeLegalEntityId: "le-" + t.id,
      mfaCompleted: true,
    });
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .post("/billing/reserve")
        .set("Authorization", `Bearer ${tok}`)
        .send({ orderId: "c-a", amount: 80000 }),
      request(app.getHttpServer())
        .post("/billing/reserve")
        .set("Authorization", `Bearer ${tok}`)
        .send({ orderId: "c-b", amount: 80000 }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 402]);
    const reserves = await prisma.ledgerEntry.count({
      where: { tenantId: t.id, kind: "RESERVE" },
    });
    expect(reserves).toBe(1); // только один резерв создан
  });

  it("RELEASE освобождает резерв (BILL-019), инвариант держится", async () => {
    await request(app.getHttpServer())
      .post("/billing/reserve")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId: "r-1", amount: 30000 })
      .expect(201);
    await request(app.getHttpServer())
      .post("/billing/release")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId: "r-1", reason: "отмена" })
      .expect(200);
    const total = await assertLedgerInvariant();
    const activeReserve = total.reserve - total.release;
    const bal = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const available = BigInt(bal.body.available);
    expect(available).toBe(total.topup - total.settle - activeReserve);
  });

  it("RELEASE идемпотентен: повторный release не инфлейтит available", async () => {
    await request(app.getHttpServer())
      .post("/billing/reserve")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId: "r-2", amount: 20000 })
      .expect(201);
    await request(app.getHttpServer())
      .post("/billing/release")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId: "r-2", reason: "отмена" })
      .expect(200);
    // повторный RELEASE — идемпотентен (нет второй RELEASE-проводки)
    await request(app.getHttpServer())
      .post("/billing/release")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId: "r-2", reason: "повтор" })
      .expect(200);
    const releases = await prisma.ledgerEntry.count({
      where: { tenantId, kind: "RELEASE", refOrderId: "r-2" },
    });
    expect(releases).toBe(1);
    const total = await assertLedgerInvariant();
    const bal = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    // available не вырос сверх balance (нет инфляции)
    expect(BigInt(bal.body.available)).toBeLessThanOrEqual(
      BigInt(bal.body.balance)
    );
    expect(total.reserve - total.release).toBe(BigInt(0));
  });

  it("SETTLE ограничен available: списание сверх → 402, баланс не уходит в минус", async () => {
    const t = await prisma.tenant.create({
      data: { bin: "777000111555", name: "СеттлТен", status: "ACTIVE" },
    });
    const acc = await prisma.account.create({
      data: { tenantId: t.id, legalEntityId: "le-" + t.id, balance: BigInt(0) },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId: t.id,
        legalEntityId: "le-" + t.id,
        accountId: acc.id,
        kind: "TOPUP",
        amount: BigInt(50000),
        reason: "seed",
      },
    });
    await prisma.account.update({
      where: { id: acc.id },
      data: { balance: BigInt(50000) },
    });
    const tok = app.get(JwtService).sign({
      sub: `u1`,
      tenantId: t.id,
      roles: ["admin"],
      activeLegalEntityId: "le-" + t.id,
      mfaCompleted: true,
    });
    // списание 50000 проходит, баланс → 0
    await request(app.getHttpServer())
      .post("/billing/settle")
      .set("Authorization", `Bearer ${tok}`)
      .send({ orderId: "s-1", amount: 50000 })
      .expect(200);
    // повторное списание сверх → 402, баланс не отрицательный
    await request(app.getHttpServer())
      .post("/billing/settle")
      .set("Authorization", `Bearer ${tok}`)
      .send({ orderId: "s-2", amount: 10000 })
      .expect(402);
    const bal = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    expect(bal.body.balance).toBe("0");
    expect(BigInt(bal.body.available)).toBe(BigInt(0));
  });

  it("SETTLE списывает баланс (п.26), резерв гасится", async () => {
    await request(app.getHttpServer())
      .post("/billing/settle")
      .set("Authorization", `Bearer ${token}`)
      .send({ orderId: "o-2", amount: 30000, reason: "нанесение" })
      .expect(200);
    await assertLedgerInvariant();
    const bal = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(bal.body.balance).toBe("70000"); // 100000 - 30000
  });

  it("Tariff: активный на дату; нет активного → ошибка «тариф не настроен»", async () => {
    // seed активного тарифа нет по умолчанию
    const none = await request(app.getHttpServer())
      .get("/billing/tariff/active")
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
    expect(none.body.message).toMatch(/тариф/i);

    await prisma.tariff.create({
      data: {
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        pricePerCodeKZT: BigInt(10000),
      },
    });
    const ok = await request(app.getHttpServer())
      .get("/billing/tariff/active")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(ok.body.pricePerCodeKZT).toBe("10000");
    expect(ok.body.unit).toBe("KM");
  });

  it("UI-06c: GET /billing/ledger — пустой tenant → пустой список", async () => {
    // отдельный tenant без проводок
    const t = await prisma.tenant.create({
      data: { bin: "777000111666", name: "ПустоТен", status: "ACTIVE" },
    });
    await prisma.account.create({
      data: { tenantId: t.id, legalEntityId: "le-" + t.id, balance: BigInt(0) },
    });
    const tok = app.get(JwtService).sign({
      sub: `u1`,
      tenantId: t.id,
      roles: ["admin"],
      activeLegalEntityId: "le-" + t.id,
      mfaCompleted: true,
    });
    const res = await request(app.getHttpServer())
      .get("/billing/ledger")
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    expect(res.body.items).toEqual([]);
  });

  it("UI-06c: GET /billing/ledger — tenant-scoped, desc, баланс после операции", async () => {
    // создать проводки вручную (в отдельном tenant, чтобы не мешать предыдущим тестам)
    const t = await prisma.tenant.create({
      data: { bin: "777000111777", name: "ЛеджТен", status: "ACTIVE" },
    });
    const acc = await prisma.account.create({
      data: { tenantId: t.id, legalEntityId: "le-" + t.id, balance: BigInt(0) },
    });
    const tok = app.get(JwtService).sign({
      sub: `u1`,
      tenantId: t.id,
      roles: ["admin"],
      activeLegalEntityId: "le-" + t.id,
      mfaCompleted: true,
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId: t.id,
        legalEntityId: "le-" + t.id,
        accountId: acc.id,
        kind: "TOPUP",
        amount: BigInt(1000),
        ref1c: "ledger-t1",
        createdAt: new Date(Date.now() - 3000),
      },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId: t.id,
        legalEntityId: "le-" + t.id,
        accountId: acc.id,
        kind: "SETTLE",
        amount: BigInt(300),
        refOrderId: "o-ledger",
        createdAt: new Date(Date.now() - 2000),
      },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId: t.id,
        legalEntityId: "le-" + t.id,
        accountId: acc.id,
        kind: "TOPUP",
        amount: BigInt(500),
        ref1c: "ledger-t2",
        createdAt: new Date(Date.now() - 1000),
      },
    });
    const res = await request(app.getHttpServer())
      .get("/billing/ledger")
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    const items = res.body.items;
    expect(items.length).toBe(3);
    // desc: самый свежий (TOPUP 500) первым
    expect(items[0].kind).toBe("TOPUP");
    expect(items[0].amount).toBe("500");
    expect(items[0].ref1c).toBe("ledger-t2");
    // поля целые тенге-строки
    for (const it of items) {
      expect(typeof it.amount).toBe("string");
      expect(/^\d+$/.test(it.amount)).toBe(true);
    }
    // баланс после операции: TOPUP 500 после всех = 1000-300+500 = 1200
    expect(items[0].balance).toBe("1200");
  });
});
