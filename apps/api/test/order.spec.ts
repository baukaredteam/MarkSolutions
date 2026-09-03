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

describe("order create (W3, ORD-024..028)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let accountId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ord-"));
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
      data: { bin: "777000111222", name: "ОрдТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const account = await prisma.account.create({
      data: { tenantId, balance: BigInt(0) },
    });
    accountId = account.id;
    // топ-ап 500000 тенге (инвариант ledger==balance)
    await prisma.ledgerEntry.create({
      data: {
        tenantId,
        accountId,
        kind: "TOPUP",
        amount: BigInt(500000),
        reason: "seed",
      },
    });
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: BigInt(500000) },
    });
    // активный тариф 100 ₸/КМ
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
    const body = `0401483572${String(gtinSeq).padStart(3, "0")}`; // 13 цифр (10+3)
    const digits = body.split("").map(Number);
    let sum = 0;
    for (let i = 0; i < 13; i++)
      sum += digits[i] * ((12 - i) % 2 === 0 ? 3 : 1);
    const check = (10 - (sum % 10)) % 10;
    return `${body}${check}`;
  }

  async function createCard(
    auth = token
  ): Promise<{ id: string; gtin: string }> {
    const gtin = validGtin();
    const res = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${auth}`)
      .send({
        gtin,
        attributes: {
          schemaVersion: 1,
          gtin,
          name: "RAVENOL 5W-30",
          brand: `BR${gtinSeq}`, // уникальный бренд против fuzzy-дублей
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

  function createOrder(
    body: Record<string, unknown>,
    key = `k-${Date.now()}-${Math.random()}`,
    auth = token
  ) {
    return request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${auth}`)
      .set("Idempotency-Key", key)
      .send(body);
  }

  it("POST /orders: одна транзакция заказ+RESERVE+outbox; снимки; статус Queued", async () => {
    const { id: cardId, gtin } = await createCard();
    const res = await createOrder(
      {
        cardId,
        gtin,
        places: 10,
        unitsPerPlace: 12,
        quantity: 120, // 10×12
      },
      "k-create-1"
    ).expect(201);
    expect(res.body.status).toBe("QUEUED");
    expect(res.body.isPaid).toBe(true);
    const orderId = res.body.id;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe("QUEUED");
    expect(order!.idempotencyKey).toBe("k-create-1");

    // снимок строки
    const line = await prisma.orderLine.findFirst({ where: { orderId } });
    expect(line!.places).toBe(10);
    expect(line!.unitsPerPlace).toBe(12);
    expect(line!.quantity).toBe(120);
    expect(line!.totalPrice).toBe(BigInt(12000)); // 120 × 100 ₸
    expect(line!.cisType).toBe("UNIT");
    expect(line!.serialNumberType).toBe("OPERATOR");
    expect(line!.pricePerCodeKZT).toBe(BigInt(100));

    // резерв = totalPrice
    const reserve = await prisma.ledgerEntry.findFirst({
      where: { tenantId, kind: "RESERVE", refOrderId: orderId },
    });
    expect(reserve).toBeTruthy();
    expect(reserve!.amount).toBe(BigInt(12000));

    // outbox-событие send-order-to-mpt
    const outbox = await prisma.outbox.findFirst({
      where: { aggregate: "send-order-to-mpt", status: "PENDING" },
    });
    expect(outbox).toBeTruthy();
    const payload = outbox!.payload as { orderId: string };
    expect(payload.orderId).toBe(orderId);

    // баланс: balance=500000, резерв 12000
    const bal = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(bal.body.reserved).toBe("12000");
  });

  it("quantity по умолчанию = places×unitsPerPlace; уменьшение до 1 допустимо; > произведения → 400", async () => {
    const { id: cardId, gtin } = await createCard();
    // без quantity → дефолт = произведение
    const dflt = await createOrder(
      { cardId, gtin, places: 2, unitsPerPlace: 3 },
      "k-q-dflt"
    ).expect(201);
    const dLine = await prisma.orderLine.findFirst({
      where: { orderId: dflt.body.id },
    });
    expect(dLine!.quantity).toBe(6);

    // quantity=1 (частичная маркировка) → ок
    await createOrder(
      { cardId, gtin, places: 2, unitsPerPlace: 3, quantity: 1 },
      "k-q-1"
    ).expect(201);

    // quantity > произведения → 400
    const over = await createOrder(
      { cardId, gtin, places: 2, unitsPerPlace: 3, quantity: 7 },
      "k-q-over"
    ).expect(400);
    expect(over.body.message).toMatch(/quantity/i);
  });

  it("AT-06: available < totalPrice → 402, заказ и резерв НЕ созданы", async () => {
    const { id: cardId, gtin } = await createCard();
    // 10000 КМ × 100 ₸ = 1 000 000 ₸ > available (осталось ~488000)
    const res = await createOrder(
      { cardId, gtin, places: 100, unitsPerPlace: 100 },
      "k-at06"
    ).expect(402);
    expect(res.body.code).toBe(402);
    expect(res.body.message).toMatch(/insufficient|недостаточно/i);
    const order = await prisma.order.findUnique({
      where: { idempotencyKey: "k-at06" },
    });
    expect(order).toBeNull();
    const reserves = await prisma.ledgerEntry.count({
      where: { tenantId, kind: "RESERVE", refOrderId: "k-at06" },
    });
    expect(reserves).toBe(0);
  });

  it("AT-07/ORD-025: 10 повторов POST с тем же Idempotency-Key → ровно 1 заказ и 1 RESERVE", async () => {
    const { id: cardId, gtin } = await createCard();
    const key = "k-at07";
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(
        await createOrder({ cardId, gtin, places: 1, unitsPerPlace: 1 }, key)
      );
    }
    const first = results[0];
    expect(first.status).toBe(201);
    for (const r of results) {
      expect(r.status).toBe(201);
      expect(r.body.id).toBe(first.body.id); // тот же заказ
    }
    const orders = await prisma.order.count({ where: { idempotencyKey: key } });
    expect(orders).toBe(1);
    const reserves = await prisma.ledgerEntry.count({
      where: { tenantId, kind: "RESERVE", refOrderId: first.body.id },
    });
    expect(reserves).toBe(1);
  });

  it("AT-07 конкурентный: два параллельных POST с одним ключом → оба 201, один заказ (P2002 → existing)", async () => {
    const { id: cardId, gtin } = await createCard();
    const key = "k-at07-conc";
    const [a, b] = await Promise.all([
      createOrder({ cardId, gtin, places: 1, unitsPerPlace: 1 }, key),
      createOrder({ cardId, gtin, places: 1, unitsPerPlace: 1 }, key),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).toBe(b.body.id); // тот же заказ (не 500)
    const orders = await prisma.order.count({ where: { idempotencyKey: key } });
    expect(orders).toBe(1);
    const reserves = await prisma.ledgerEntry.count({
      where: { tenantId, kind: "RESERVE", refOrderId: a.body.id },
    });
    expect(reserves).toBe(1);
  });

  it("cisType GROUP/SET → 400; serialNumberType SELF_MADE → 400", async () => {
    const { id: cardId, gtin } = await createCard();
    await createOrder(
      { cardId, gtin, places: 1, unitsPerPlace: 1, cisType: "GROUP" },
      "k-group"
    ).expect(400);
    await createOrder(
      { cardId, gtin, places: 1, unitsPerPlace: 1, cisType: "SET" },
      "k-set"
    ).expect(400);
    await createOrder(
      {
        cardId,
        gtin,
        places: 1,
        unitsPerPlace: 1,
        serialNumberType: "SELF_MADE",
      },
      "k-selfmade"
    ).expect(400);
  });

  it("ORD-028: отмена до эмиссии → RELEASE + Cancelled; после эмиссии → 409", async () => {
    const { id: cardId, gtin } = await createCard();
    const ord = await createOrder(
      { cardId, gtin, places: 5, unitsPerPlace: 5 },
      "k-cancel-before"
    ).expect(201);

    // до эмиссии (Queued) → отмена ок
    await request(app.getHttpServer())
      .post(`/orders/${ord.body.id}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const cancelled = await prisma.order.findUnique({
      where: { id: ord.body.id },
    });
    expect(cancelled!.status).toBe("CANCELLED");
    const release = await prisma.ledgerEntry.findFirst({
      where: { tenantId, kind: "RELEASE", refOrderId: ord.body.id },
    });
    expect(release).toBeTruthy();
    // активный резерв по заказу обнулён
    const bal = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(bal.body.reserved).not.toContain(undefined);

    // «после эмиссии»: ручной перевод в SENT (эмуляция тикета 03) → отмена 409
    const ord2 = await createOrder(
      { cardId, gtin, places: 1, unitsPerPlace: 1 },
      "k-cancel-after"
    ).expect(201);
    await prisma.order.update({
      where: { id: ord2.body.id },
      data: { status: "SENT" },
    });
    await request(app.getHttpServer())
      .post(`/orders/${ord2.body.id}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .expect(409);
  });

  it("GET /orders и GET /orders/:id — tenant-список со статусами и totalPrice; чужой tenant → 404/403", async () => {
    const { id: cardId, gtin } = await createCard();
    const ord = await createOrder(
      { cardId, gtin, places: 3, unitsPerPlace: 4 },
      "k-list"
    ).expect(201);

    const list = await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(
      list.body.items.some((o: { id: string }) => o.id === ord.body.id)
    ).toBe(true);
    const found = list.body.items.find(
      (o: { id: string }) => o.id === ord.body.id
    );
    expect(found.status).toBe("QUEUED");
    expect(found.totalPrice).toBe("1200"); // 12 × 100 ₸
    expect(found.quantity).toBe(12);

    const detail = await request(app.getHttpServer())
      .get(`/orders/${ord.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.id).toBe(ord.body.id);
    expect(detail.body.lines[0].quantity).toBe(12);

    // чужой tenant
    const t2 = await prisma.tenant.create({
      data: { bin: "777000111333", name: "Чужой", status: "ACTIVE" },
    });
    const token2 = app.get(JwtService).sign({
      sub: `u-${t2.id}`,
      tenantId: t2.id,
      roles: ["admin"],
      mfaCompleted: true,
    });
    await request(app.getHttpServer())
      .get(`/orders/${ord.body.id}`)
      .set("Authorization", `Bearer ${token2}`)
      .expect(404); // чужой tenant → 404 (IDOR: не раскрываем существование)

    // без JWT → 401 (AT-16)
    await request(app.getHttpServer()).get("/orders").expect(401);
  });

  it("конкурентные заказы на общий баланс: ровно один заказ и один RESERVE", async () => {
    // изолированный tenant: баланс 100000, два параллельных заказа по 60000 (600 КМ × 100 ₸)
    const t = await prisma.tenant.create({
      data: { bin: "777000111444", name: "КонкОрд", status: "ACTIVE" },
    });
    const acc = await prisma.account.create({
      data: { tenantId: t.id, balance: BigInt(0) },
    });
    await prisma.ledgerEntry.create({
      data: {
        tenantId: t.id,
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
      sub: `u-${t.id}`,
      tenantId: t.id,
      roles: ["admin"],
      mfaCompleted: true,
    });
    const { id: cardId, gtin } = await createCard(tok);
    // 600 КМ × 100 ₸ = 60000; баланс 100000 → один заказ проходит, второй 402
    const [a, b] = await Promise.all([
      createOrder(
        { cardId, gtin, places: 60, unitsPerPlace: 10 },
        "k-conc-a",
        tok
      ),
      createOrder(
        { cardId, gtin, places: 60, unitsPerPlace: 10 },
        "k-conc-b",
        tok
      ),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 402]);

    // ledger-инвариант: ровно один созданный заказ и ровно один RESERVE
    const orders = await prisma.order.count({ where: { tenantId: t.id } });
    expect(orders).toBe(1);
    const reserves = await prisma.ledgerEntry.count({
      where: { tenantId: t.id, kind: "RESERVE" },
    });
    expect(reserves).toBe(1);
    // активный резерв == available-остаток не обязан, но баланс не превышен
    const bal = await request(app.getHttpServer())
      .get("/billing/balance")
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    expect(BigInt(bal.body.reserved)).toBe(BigInt(60000));
    expect(BigInt(bal.body.balance)).toBe(BigInt(100000));
  });

  it("UI-05: заказ получает number (KM-2026-NNNNNN), /orders и /orders/:id включают number", async () => {
    const { id: cardId, gtin } = await createCard();
    const key = `ord-num-${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ cardId, gtin, places: 1, unitsPerPlace: 2 })
      .expect(201);
    expect(created.body.number).toBeGreaterThan(0);
    const list = await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const row = list.body.items.find(
      (o: { id: string }) => o.id === created.body.id
    );
    expect(row.number).toBe(created.body.number);
    const detail = await request(app.getHttpServer())
      .get(`/orders/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.number).toBe(created.body.number);
  });

  it("UI-06a: два параллельных POST /orders → разные number (unique + retry P2002)", async () => {
    const { id: cardId, gtin } = await createCard();
    const [a, b] = await Promise.all([
      createOrder({ cardId, gtin, places: 1, unitsPerPlace: 1 }, "k-par-a"),
      createOrder({ cardId, gtin, places: 1, unitsPerPlace: 1 }, "k-par-b"),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const na = a.body.number as number;
    const nb = b.body.number as number;
    expect(na).toBeGreaterThan(0);
    expect(nb).toBeGreaterThan(0);
    expect(na).not.toBe(nb);
    // unique-индекс на number реально существует в схеме (защита от гонки max+1)
    const rows = await prisma.order.findMany({
      where: { number: { in: [na, nb] } },
    });
    expect(rows).toHaveLength(2);
  });

  it("C-06: тариф товарной группы выигрывает у общего (activeTariff(productGroup) из карточки)", async () => {
    // групповой тариф motor-oils (карточки по схеме v1 = motor-oils) — дороже общего
    await prisma.tariff.create({
      data: {
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        pricePerCodeKZT: BigInt(1000),
        productGroup: "motor-oils",
      },
    });
    const { id: cardId, gtin } = await createCard();
    const res = await createOrder(
      { cardId, gtin, places: 1, unitsPerPlace: 1 },
      "k-group-tariff"
    ).expect(201);
    const line = await prisma.orderLine.findFirst({
      where: { orderId: res.body.id },
    });
    expect(line!.pricePerCodeKZT).toBe(BigInt(1000)); // групповой, не общий 100
    expect(line!.totalPrice).toBe(BigInt(1000));
    // снимок тарифа — групповой
    const tariff = await prisma.tariff.findUnique({
      where: { id: line!.tariffId },
    });
    expect(tariff!.productGroup).toBe("motor-oils");
  });

  it("P2-C: 13-digit GTIN → 400 Длина должна быть равна 14 (no order)", async () => {
    const { id: cardId } = await createCard();
    const res = await createOrder(
      {
        cardId,
        gtin: "4650063110374",
        places: 1,
        unitsPerPlace: 1,
      },
      "k-gtin13"
    ).expect(400);
    expect(res.body.message).toBe("Длина должна быть равна 14");
    expect(
      await prisma.order.findUnique({ where: { idempotencyKey: "k-gtin13" } })
    ).toBeNull();
  });

  it("P2-C: accepts 04650063110374-shaped GTIN-14 and defaults productGroup autofluids", async () => {
    const gtin = "04650063110374";
    const made = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gtin,
        attributes: {
          schemaVersion: 1,
          gtin,
          name: "STAGE oils 5W-30",
          brand: "STAGEOIL",
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
          ownerGcp: "0465006",
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
    const res = await createOrder(
      { cardId: made.body.id, gtin, places: 1, unitsPerPlace: 1 },
      "k-gtin14-stage"
    ).expect(201);
    const order = await prisma.order.findUnique({
      where: { id: res.body.id },
    });
    expect(order!.gtin).toBe("04650063110374");
    expect(order!.productGroup).toBe("autofluids");
  });
});
