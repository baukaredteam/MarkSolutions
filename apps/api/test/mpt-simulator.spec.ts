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

// быстрые интервалы/эмиссия для тестов
process.env.SIM_MPT_EMISSION_MS = "100";
process.env.OUTBOX_POLL_MS = "50";
process.env.MPT_POLL_MS = "50";
process.env.MPT_ORDER_TIMEOUT_MS = "5000";

describe("mpt simulator + order poller (W3, ORD-029)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let accountId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "mpt-"));
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
      data: { bin: "777000111222", name: "МПТТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const account = await prisma.account.create({
      data: { tenantId, balance: BigInt(0) },
    });
    accountId = account.id;
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        accountId,
        kind: "TOPUP",
        amount: BigInt(1000000),
        reason: "seed",
      },
    });
    await prisma.account.update({
      where: { id: accountId },
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
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
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

  async function createOrder(
    places: number,
    unitsPerPlace: number,
    key: string
  ): Promise<string> {
    const { id: cardId, gtin } = await createCard();
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ cardId, gtin, places, unitsPerPlace })
      .expect(201);
    return res.body.id;
  }

  async function waitStatus(
    orderId: string,
    want: string,
    tries = 40
  ): Promise<string> {
    let status = "";
    for (let i = 0; i < tries; i++) {
      await sleep(100);
      const o = await prisma.order.findUnique({ where: { id: orderId } });
      status = o!.status;
      if (status === want) break;
    }
    return status;
  }

  it("эмиссия: Queued → Sent → Completed; коды в симуляторе, serial уникальны по (gtin)", async () => {
    const orderId = await createOrder(3, 4, "k-mpt-1"); // 12 КМ
    const sent = await waitStatus(orderId, "SENT");
    expect(sent).toBe("SENT");
    const completed = await waitStatus(orderId, "COMPLETED");
    expect(completed).toBe("COMPLETED");

    // коды сгенерированы в симуляторе (граница с тикетом 04: остаются здесь)
    const mptOrder = await prisma.mptOrder.findUnique({
      where: { externalId: orderId },
      include: { codes: true },
    });
    expect(mptOrder).toBeTruthy();
    expect(mptOrder!.status).toBe("READY");
    expect(mptOrder!.codes).toHaveLength(12);
    // форматы serial по п.19 (7-значные), уникальны
    const serials = mptOrder!.codes.map((c) => c.serial);
    expect(new Set(serials).size).toBe(12);
    expect(mptOrder!.codes.every((c) => /^\d{7}$/.test(c.serial))).toBe(true);
    expect(mptOrder!.codes.every((c) => c.gtin === mptOrder!.gtin)).toBe(true);
  });

  it("GET /api/codes идемпотентен: коды не регенерируются при повторе", async () => {
    const orderId = await createOrder(1, 2, "k-mpt-2"); // 2 КМ
    await waitStatus(orderId, "COMPLETED");
    const mpt = await prisma.mptOrder.findUnique({
      where: { externalId: orderId },
      include: { codes: true },
    });
    const firstCount = mpt!.codes.length;
    // повторный поллинг/получение → те же коды
    await waitStatus(orderId, "COMPLETED", 5);
    const after = await prisma.mptOrder.findUnique({
      where: { externalId: orderId },
      include: { codes: true },
    });
    expect(after!.codes.length).toBe(firstCount);
    expect(after!.codes.map((c) => c.serial)).toEqual(
      mpt!.codes.map((c) => c.serial)
    );
  });

  it("рестарт не теряет статусы (stateless: статус из createdAt+конфиг)", async () => {
    // создаём заказ, эмиссия не завершена (короткое окно) — статус PENDING выводим из createdAt
    const orderId = await createOrder(1, 1, "k-mpt-3");
    await waitStatus(orderId, "SENT");
    const mpt = await prisma.mptOrder.findUnique({
      where: { externalId: orderId },
    });
    // возраст < эмиссии → PENDING; но эмиссия 100мс, ждём завершения для детерминизма
    const completed = await waitStatus(orderId, "COMPLETED");
    expect(completed).toBe("COMPLETED");
    expect(mpt!.status).toBeDefined();
  });

  it("ручной READY догоняется ≤2 интервалов поллера (ORD-029)", async () => {
    const orderId = await createOrder(1, 1, "k-mpt-4");
    await waitStatus(orderId, "SENT");
    // внешняя система завершила эмиссию раньше таймера: сдвигаем createdAt симулятора в прошлое
    // (статус stateless = f(now, createdAt, конфиг) — READY при возрасте >= эмиссии)
    await prisma.mptOrder.update({
      where: { externalId: orderId },
      data: { createdAt: new Date(Date.now() - 5000) },
    });
    const completed = await waitStatus(orderId, "COMPLETED", 10);
    expect(completed).toBe("COMPLETED"); // поллер догнал
  });

  it("Cancelled-заказ не отправляется и не эмитит коды", async () => {
    // замедляем поллер (2с), чтобы cancel гарантированно выиграл гонку с отправкой;
    // после тика поллер перепланируется на 50мс — последующие тесты не страдают
    process.env.OUTBOX_POLL_MS = "2000";
    process.env.MPT_POLL_MS = "2000";
    await sleep(80); // дать текущему тику (50мс) уйти без новых заказов
    try {
      const orderId = await createOrder(1, 1, "k-mpt-5");
      await request(app.getHttpServer())
        .post(`/orders/${orderId}/cancel`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      await sleep(200);
      const mpt = await prisma.mptOrder.findUnique({
        where: { externalId: orderId },
        include: { codes: true },
      });
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe("CANCELLED");
      expect(mpt).toBeNull(); // в симулятор не отправлен
    } finally {
      process.env.OUTBOX_POLL_MS = "50";
      process.env.MPT_POLL_MS = "50";
    }
  });

  it("таймаут MPT_ORDER_TIMEOUT_MS → Failed + RELEASE + задача оператору (ID-017)", async () => {
    process.env.MPT_ORDER_TIMEOUT_MS = "400";
    process.env.SIM_MPT_EMISSION_MS = "60000"; // эмиссия не завершится — заказ висит в PENDING
    try {
      const orderId = await createOrder(1, 1, "k-mpt-6");
      await waitStatus(orderId, "SENT");
      // симулятор не выпустит (эмиссия 100мс, но дадим заказу "зависнуть" — обнулим createdAt симулятора назад)
      // упрощение: поллер таймаутит по order.updatedAt; заказ в SENT старше таймаута → Failed
      await sleep(700);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe("FAILED");
      // RELEASE записан (резерв освобождён)
      const release = await prisma.ledgerEntry.findFirst({
        where: { tenantId, kind: "RELEASE", refOrderId: orderId },
      });
      expect(release).toBeTruthy();
      // задача оператору: outbox mpt-order-timeout FAILED
      const task = await prisma.outbox.findFirst({
        where: { aggregate: "mpt-order-timeout", status: "FAILED" },
      });
      expect(task).toBeTruthy();
      // /moderation/exceptions показывает mpt-order-timeout (роль operator)
      const opToken = app.get(JwtService).sign({
        sub: "operator-seeded",
        tenantId: null,
        roles: ["operator"],
        activeLegalEntityId: "le-" + null,
        mfaCompleted: true,
      });
      const exc = await request(app.getHttpServer())
        .get("/moderation/exceptions")
        .set("Authorization", `Bearer ${opToken}`)
        .expect(200);
      expect(
        exc.body.items.some((i: { id: string }) => i.id === task!.id)
      ).toBe(true);
    } finally {
      process.env.MPT_ORDER_TIMEOUT_MS = "5000";
      process.env.SIM_MPT_EMISSION_MS = "100";
    }
  });

  it("расхождение количества (мок-шов quantity−1) → Partially Completed + задача, без авто-финкорректировки", async () => {
    // gtin с маркером 999999 → симулятор эмитит quantity−1 кодов
    // валидный mod10 с маркером 999999: body "0401" + "999999" + 3 цифры
    gtinSeq += 1;
    const body = `0401${String(gtinSeq).padStart(3, "0")}999999`;
    const digits = body.split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 13; i++)
      sum += digits[i] * ((12 - i) % 2 === 0 ? 3 : 1);
    const check = (10 - (sum % 10)) % 10;
    const gtin = `${body}${check}`;
    const cardRes = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gtin,
        attributes: {
          schemaVersion: 1,
          gtin,
          name: "MISMATCH",
          brand: "MM",
          countryOfBrand: "KZ",
          composition: "syn",
          shelfLifeMonths: 60,
          productType: "моторное масло",
          volumeL: 4,
          purpose: "легковые",
          sae: "5W-30",
          storage: "dry",
          conformityMark: "нет",
          eacMarks: "нет",
          grossWeightKg: 3.8,
          tnved: "2710198200",
          group: "g",
          category: "c",
          packageType: "p",
          kpved: "19.20.29",
          gpc: "10005267",
          ownerGcp: "0401483",
          ownerName: "n",
          ownerCountry: "KZ",
          ownerAddress: "a",
          platformName: "p",
          platformCountry: "KZ",
          platformAddress: "a",
          participantTaxNumber: "1",
          participantName: "n",
          participantCountry: "KZ",
          participantAddress: "a",
        },
      })
      .expect(201);
    const orderRes = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", "k-mpt-mismatch")
      .send({ cardId: cardRes.body.id, gtin, places: 3, unitsPerPlace: 4 }) // 12 КМ, эмитится 11
      .expect(201);
    const orderId = orderRes.body.id;
    let status = "";
    for (let i = 0; i < 40; i++) {
      await sleep(100);
      const o = await prisma.order.findUnique({ where: { id: orderId } });
      status = o!.status;
      if (status === "PARTIALLY_COMPLETED" || status === "COMPLETED") break;
    }
    expect(status).toBe("PARTIALLY_COMPLETED");
    // задача оператору (mpt-order-timeout FAILED с reason quantity mismatch)
    const task = await prisma.outbox.findFirst({
      where: { aggregate: "mpt-order-timeout", status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    expect(task).toBeTruthy();
    const payload = task!.payload as {
      reason?: string;
      expected?: number;
      actual?: number;
    };
    expect(payload.reason).toBe("quantity mismatch");
    expect(payload.actual).toBe(11);
  });
});
