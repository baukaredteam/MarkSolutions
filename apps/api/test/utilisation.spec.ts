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
import { BillingService } from "../src/billing.service";

process.env.SIM_MPT_EMISSION_MS = "100";
process.env.OUTBOX_POLL_MS = "50";
process.env.MPT_POLL_MS = "50";
process.env.MPT_ORDER_TIMEOUT_MS = "5000";
process.env.UTIL_SLA_MS = "150";
process.env.KMS_PROFILE = "file";
process.env.KMS_FILE_DIR = join(process.cwd(), "tmp-kms-test");

describe("utilisation (W3, п.26)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;
  let opToken: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "util-"));
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
      data: { bin: "777000111222", name: "УтлТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const account = await prisma.account.create({
      data: { tenantId, balance: BigInt(0) },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        accountId: account.id,
        kind: "TOPUP",
        amount: BigInt(1000000),
        reason: "seed",
      },
    });
    await prisma.account.update({
      where: { id: account.id },
      data: { balance: BigInt(1000000) },
    });
    await prisma.tariff.deleteMany();
    await prisma.tariff.create({
      data: {
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        pricePerCodeKZT: BigInt(100),
      },
    });
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: "u1",
      tenantId,
      roles: ["admin"],
      activeLegalEntityId: "le-" + tenantId,
      mfaCompleted: true,
    });
    opToken = jwt.sign({
      sub: "op",
      tenantId: null,
      roles: ["operator"],
      activeLegalEntityId: "le-" + null,
      mfaCompleted: true,
    });
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await rm(join(process.cwd(), "tmp-kms-test"), {
      recursive: true,
      force: true,
    }).catch(() => {});
  });

  let gtinSeq = 0;
  function validGtin(): string {
    gtinSeq += 1;
    const body = `0401483572${String(gtinSeq).padStart(3, "0")}`;
    const digits = body.split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 13; i++)
      sum += digits[i] * ((12 - i) % 2 === 0 ? 3 : 1);
    const check = (10 - (sum % 10)) % 10;
    return `${body}${check}`;
  }

  async function createCard(): Promise<{ id: string; gtin: string }> {
    const gtin = validGtin();
    const res = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gtin,
        attributes: {
          schemaVersion: 1,
          gtin,
          name: "RAVENOL 5W-30",
          brand: `BR${gtinSeq}`,
          countryOfBrand: "Германия",
          composition: "синтетическое",
          shelfLifeMonths: 60,
          productType: "моторное масло",
          volumeL: 4,
          purpose: "легковые",
          sae: "5W-30",
          storage: "сухое",
          conformityMark: "нет",
          eacMarks: "нет",
          grossWeightKg: 3.8,
          tnved: "2710198200",
          group: "Смазочные материалы",
          category: "Моторные масла",
          packageType: "Единица товара",
          kpved: "19.20.29",
          gpc: "10005267",
          ownerGcp: "0401483",
          ownerName: "ТОО Автодеталь",
          ownerCountry: "Казахстан",
          ownerAddress: "г. Шымкент",
          platformName: "1ecom",
          platformCountry: "Казахстан",
          platformAddress: "г. Алматы",
          participantTaxNumber: "123456789012",
          participantName: "ТОО Автодеталь",
          participantCountry: "Казахстан",
          participantAddress: "г. Шымкент",
        },
      })
      .expect(201);
    return { id: res.body.id, gtin };
  }

  async function completedOrder(
    key: string,
    places = 2,
    units = 2
  ): Promise<string> {
    const { id: cardId, gtin } = await createCard();
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ cardId, gtin, places, unitsPerPlace: units })
      .expect(201);
    const orderId = res.body.id;
    let status = "";
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const o = await prisma.order.findUnique({ where: { id: orderId } });
      status = o!.status;
      if (status === "COMPLETED" || status === "PARTIALLY_COMPLETED") break;
    }
    expect(["COMPLETED", "PARTIALLY_COMPLETED"]).toContain(status);
    const want = places * units;
    for (let i = 0; i < 40; i++) {
      await sleep(50);
      const n = await prisma.codeVault.count({ where: { orderId } });
      if (n >= want) break;
    }
    return orderId;
  }

  function postUtilisation(
    orderId: string,
    overrides: Record<string, unknown> = {},
    key = `util-${Date.now()}`
  ) {
    return request(app.getHttpServer())
      .post("/utilisation")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({
        orderId,
        releaseType: "PRODUCTION",
        expirationDate: "2027-08-01",
        productionDate: "2026-08-01",
        manufacturerCountry: "DE",
        ...overrides,
      });
  }

  async function waitReport(
    orderId: string,
    want: string
  ): Promise<{ status: string; rejectReason?: string | null }> {
    const report = await prisma.utilisationReport.findFirst({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    });
    let st = report?.status ?? "";
    for (let i = 0; i < 40; i++) {
      if (st === want) break;
      await sleep(150);
      const r = await prisma.utilisationReport.findFirst({
        where: { orderId },
        orderBy: { createdAt: "asc" },
      });
      st = r?.status ?? "";
    }
    const fresh = await prisma.utilisationReport.findFirst({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    });
    return { status: st, rejectReason: fresh?.rejectReason ?? null };
  }

  it("нанесение без expirationDate → 400", async () => {
    const orderId = await completedOrder("k-u-400");
    const res = await postUtilisation(orderId, {
      expirationDate: undefined,
    }).expect(400);
    expect(res.body.code).toBe(400);
  });

  it("SUCCESS: коды UTILISED, balance −= totalPrice, резерв 0, SETTLE с refOrderId", async () => {
    const orderId = await completedOrder("k-u-ok", 2, 2); // 4 КМ × 100 = 400 ₸
    const balanceBefore = BigInt(
      (
        await request(app.getHttpServer())
          .get("/billing/balance")
          .set("Authorization", `Bearer ${token}`)
          .expect(200)
      ).body.balance
    );
    const res = await postUtilisation(orderId).expect(201);
    expect(res.body.reportId).toBeTruthy();
    const done = await waitReport(orderId, "SUCCESS");
    expect(done.status).toBe("SUCCESS");

    // коды UTILISED
    const vault = await prisma.codeVault.findMany({ where: { orderId } });
    expect(vault.length).toBe(4);
    expect(vault.every((v) => v.status === "UTILISED")).toBe(true);

    // balance уменьшился на totalPrice (400)
    const bal = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(BigInt(bal.body.balance)).toBe(balanceBefore - BigInt(400));
    // резерв именно этого заказа погашен (RELEASE на заказ)
    const reserve = await prisma.ledgerEntry.findFirst({
      where: { tenantId, kind: "RESERVE", refOrderId: orderId },
    });
    const release = await prisma.ledgerEntry.findFirst({
      where: { tenantId, kind: "RELEASE", refOrderId: orderId },
    });
    expect(reserve).toBeTruthy();
    expect(release).toBeTruthy(); // резерв заказа выпущен
    expect(release!.amount).toBe(BigInt(400));

    // SETTLE с refOrderId и причиной
    const settle = await prisma.ledgerEntry.findFirst({
      where: { tenantId, kind: "SETTLE", refOrderId: orderId },
    });
    expect(settle).toBeTruthy();
    expect(settle!.amount).toBe(BigInt(400));
    expect(settle!.reason).toMatch(/util/i);
  });

  it("повторное нанесение того же кода → ERROR (код уже нанесён)", async () => {
    const orderId = await completedOrder("k-u-dup");
    const firstRes = await postUtilisation(orderId, {}, "k-u-dup-1").expect(
      201
    );
    const firstId = firstRes.body.reportId as string;
    // ждём SUCCESS по reportId первого отчёта
    let firstStatus = "";
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const r = await prisma.utilisationReport.findUnique({
        where: { reportId: firstId },
      });
      firstStatus = r?.status ?? "";
      if (firstStatus === "SUCCESS") break;
    }
    expect(firstStatus).toBe("SUCCESS");
    // второй отчёт с новым ключом и теми же кодами → симулятор отклоняет (used)
    const dupRes = await postUtilisation(orderId, {}, "k-u-dup-2").expect(201);
    const dup = await prisma.utilisationReport.findUnique({
      where: { reportId: dupRes.body.reportId },
    });
    // отчёт сразу ERROR (коды уже used)
    expect(dup!.status).toBe("ERROR");
    expect(dup!.rejectReason).toMatch(/already used/i);
  });

  it("ERROR-путь: задача оператору (ID-017) с rejectReason, списания НЕТ", async () => {
    const { id: cardId, gtin } = await createCard();
    const ord = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "k-u-err")
      .send({ cardId, gtin, places: 1, unitsPerPlace: 1 })
      .expect(201);
    const orderId = ord.body.id;
    let done2 = "";
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const o = await prisma.order.findUnique({ where: { id: orderId } });
      done2 = o!.status;
      if (done2 === "COMPLETED") break;
    }
    // удаляем коды из симулятора → sntins из Vault становятся "unknown"
    await prisma.mptCode.deleteMany({
      where: { mptOrder: { externalId: orderId } },
    });
    await postUtilisation(orderId, {}, "k-u-err-rpt").expect(201);
    const done = await waitReport(orderId, "ERROR");
    expect(done.status).toBe("ERROR");
    expect(done.rejectReason).toBeTruthy();

    // списания нет
    const settle = await prisma.ledgerEntry.findFirst({
      where: { tenantId, kind: "SETTLE", refOrderId: orderId },
    });
    expect(settle).toBeNull();
    // задача оператору: mpt-order-timeout FAILED с rejectReason
    const task = await prisma.outbox.findFirst({
      where: { aggregate: "mpt-order-timeout", status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(task).toBeTruthy();
    const payload = task!.payload as { reason?: string };
    expect(String(payload.reason ?? "")).toMatch(/utilisation|reject/i);
  });

  it("таймер 30 дней: алерты 7/3/1 + аннулирование = EXPIRED (не удаление)", async () => {
    process.env.UTIL_DEADLINE_DAYS = "30";
    try {
      const orderId = await completedOrder("k-u-timer");
      // 30−23 = 7 дней до дедлайна → алерт 7
      await prisma.order.update({
        where: { id: orderId },
        data: { updatedAt: new Date(Date.now() - 23 * 86400000) },
      });
      let alert = await prisma.utilisationAlert.findFirst({
        where: { orderId },
      });
      for (let i = 0; i < 30 && !alert; i++) {
        await sleep(200);
        alert = await prisma.utilisationAlert.findFirst({ where: { orderId } });
      }
      expect(alert).toBeTruthy();
      expect(alert!.kind).toBe("alert");
      expect(alert!.daysLeft).toBe(7);

      // сдвигаем за дедлайн (31 день) → аннулирование (EXPIRED)
      await prisma.order.update({
        where: { id: orderId },
        data: { updatedAt: new Date(Date.now() - 31 * 86400000) },
      });
      let expired = false;
      for (let i = 0; i < 30; i++) {
        await sleep(200);
        const vault = await prisma.codeVault.findMany({ where: { orderId } });
        if (vault.length > 0 && vault.every((v) => v.status === "EXPIRED")) {
          expired = true;
          break;
        }
      }
      expect(expired).toBe(true);
      // строки Vault НЕ удалены
      const vaultCount = await prisma.codeVault.count({ where: { orderId } });
      expect(vaultCount).toBeGreaterThan(0);
    } finally {
      process.env.UTIL_DEADLINE_DAYS = "30";
    }
  });

  it("GET /moderation/exceptions показывает utilisation-ошибку (ID-017)", async () => {
    const exc = await request(app.getHttpServer())
      .get("/moderation/exceptions")
      .set("Authorization", `Bearer ${opToken}`)
      .expect(200);
    expect(exc.body.items.length).toBeGreaterThan(0);
  });

  // ---- C-05: идемпотентность и атомарность финального SETTLE ----
  it("C-05: SETTLE идемпотентен по (orderId, kind) — повторный settle возвращает ту же проводку", async () => {
    const billing = app.get(BillingService);
    const orderId = await completedOrder("k-u-idem", 1, 1); // 1 КМ × 100 = 100
    const before = (await prisma.account.findFirst({ where: { tenantId } }))!
      .balance;
    const r1 = await billing.settle(tenantId, orderId, BigInt(100), "settle-1");
    const r2 = await billing.settle(tenantId, orderId, BigInt(100), "settle-2");
    expect(r1.id).toBe(r2.id); // та же проводка, не вторая
    const after = (await prisma.account.findFirst({ where: { tenantId } }))!
      .balance;
    expect(after).toBe(before - BigInt(100)); // списано ровно один раз
    const count = await prisma.ledgerEntry.count({
      where: { tenantId, kind: "SETTLE", refOrderId: orderId },
    });
    expect(count).toBe(1);
  });

  it("C-05: падение в транзакции откатывает SETTLE (нет половинчатого состояния)", async () => {
    const billing = app.get(BillingService);
    const orderId = await completedOrder("k-u-atomic", 1, 1);
    const before = (await prisma.account.findFirst({ where: { tenantId } }))!
      .balance;
    await expect(
      prisma.$transaction(async (tx) => {
        await billing.settleOn(
          tx,
          tenantId,
          orderId,
          BigInt(100),
          "atomic-test"
        );
        throw new Error("boom: code vault update failed");
      })
    ).rejects.toThrow(/boom/);
    const after = (await prisma.account.findFirst({ where: { tenantId } }))!
      .balance;
    expect(after).toBe(before); // списание откатилось
    const settle = await prisma.ledgerEntry.findFirst({
      where: { tenantId, kind: "SETTLE", refOrderId: orderId },
    });
    expect(settle).toBeNull();
  });

  // ---- C-04: businessPlaceId из заказа, не хардкод «1» ----
  it("C-04: businessPlaceId берётся из заказа (не хардкод 1)", async () => {
    const { id: cardId, gtin } = await createCard();
    const ord = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "k-u-bp")
      .send({ cardId, gtin, places: 1, unitsPerPlace: 1, businessPlaceId: 42 })
      .expect(201);
    const orderId = ord.body.id;
    let done = "";
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const o = await prisma.order.findUnique({ where: { id: orderId } });
      done = o!.status;
      if (done === "COMPLETED") break;
    }
    expect(done).toBe("COMPLETED");
    const r = await postUtilisation(orderId, {}, "k-u-bp-rpt").expect(201);
    // ждём SUCCESS
    let st = "";
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const u = await prisma.utilisationReport.findUnique({
        where: { reportId: r.body.reportId },
      });
      st = u?.status ?? "";
      if (st !== "IN_PROCESS") break;
    }
    expect(st).toBe("SUCCESS");
    const fresh = await prisma.utilisationReport.findUnique({
      where: { reportId: r.body.reportId },
    });
    expect(fresh!.businessPlaceId).toBe("42"); // значение из заказа
    const mpt = await prisma.mptUtilisation.findUnique({
      where: { reportId: r.body.reportId },
    });
    expect(mpt!.businessPlaceId).toBe(42); // на провод в симулятор ушло 42
  });

  it("C-04: заказ без businessPlaceId → отчёт не содержит хардкод «1»", async () => {
    const orderId = await completedOrder("k-u-nobp", 1, 1);
    const r = await postUtilisation(orderId, {}, "k-u-nobp-rpt").expect(201);
    let st = "";
    for (let i = 0; i < 40; i++) {
      await sleep(150);
      const u = await prisma.utilisationReport.findUnique({
        where: { reportId: r.body.reportId },
      });
      st = u?.status ?? "";
      if (st !== "IN_PROCESS") break;
    }
    expect(st).toBe("SUCCESS");
    const fresh = await prisma.utilisationReport.findUnique({
      where: { reportId: r.body.reportId },
    });
    expect(fresh!.businessPlaceId).not.toBe("1"); // нет магического «1»
  });
});
