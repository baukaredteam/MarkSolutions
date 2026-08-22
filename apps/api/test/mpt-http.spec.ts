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
import {
  HttpMptAdapter,
  canonicalJson,
  toInt32,
} from "../src/http-mpt.adapter";
import { buildAppConfig } from "../src/config-validation";
import { createMptWritePolicy } from "../src/mpt-write-policy";

// ---- fake fetch: записывает вызовы, отвечает по хендлеру ----
interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function fakeFetch(
  handler: (call: FetchCall) => Response | Promise<Response>
): { fn: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const h = (init?.headers ?? {}) as Record<string, string>;
    for (const k of Object.keys(h)) headers[k.toLowerCase()] = h[k];
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fn, calls };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let gtinSeq = 0;
function validGtin(): string {
  gtinSeq += 1;
  const body = `0401483572${String(gtinSeq).padStart(3, "0")}`; // 13 цифр
  const digits = body.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += digits[i] * ((12 - i) % 2 === 0 ? 3 : 1);
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

function makeAdapter(
  ff: ReturnType<typeof fakeFetch>,
  env: Record<string, string> = {}
): HttpMptAdapter {
  const cfg = buildAppConfig({
    APP_ENV: "test",
    MPT_BASE_URL: "https://test.markirovka.kz",
    MPT_LOGIN: "svc",
    MPT_PASSWORD: "secret",
    MPT_MAX_RETRIES: "1",
    MPT_REQUEST_TIMEOUT_MS: "2000",
    ...env,
  });
  // Transport tests inject an enabled policy in-memory to exercise the HTTP
  // mechanics (auth/backoff/documentBody). The fail-closed default (disabled)
  // is proven separately in http-mpt-write-guard.spec.ts; MPT_WRITE_ENABLED is
  // never set true in config/env.
  const policy = createMptWritePolicy({ mptWriteEnabled: true });
  const adapter = new HttpMptAdapter(cfg, undefined as never, policy);
  adapter.setFetch(ff.fn);
  return adapter;
}

describe("HttpMptAdapter (unit, fake fetch)", () => {
  it("createOrder: Accept: */*, Bearer token, Idempotency-Key = orderId, businessPlaceId int32, возвращает status + requestId", async () => {
    const ff = fakeFetch((call) => {
      if (call.url.endsWith("/api/users/authenticate"))
        return jsonResponse({ accessToken: "acc-1", refreshToken: "ref-1" });
      if (call.url.endsWith("/api/orders")) {
        expect(call.headers.accept).toBe("*/*");
        expect(call.headers.authorization).toBe("Bearer acc-1");
        expect(call.headers["idempotency-key"]).toBe("order-42");
        const body = JSON.parse(call.body ?? "{}");
        expect(body.products[0].gtin).toBe("4601005000001");
        expect(body.products[0].quantity).toBe(10);
        expect(body.products[0].cisType).toBe("UNIT");
        expect(body.businessPlaceId).toBe(7);
        expect(body.isPaid).toBe(true);
        return jsonResponse({ orderId: "mpt-order-1", status: "CREATED" });
      }
      throw new Error(`unexpected url: ${call.url}`);
    });
    const adapter = makeAdapter(ff);
    const res = await adapter.createOrder({
      orderId: "order-42",
      tenantId: "t1",
      gtin: "4601005000001",
      quantity: 10,
      serialNumberType: "OPERATOR",
      cisType: "UNIT",
      isPaid: true,
      businessPlaceId: "7",
    });
    expect(res.status).toBe("CREATED");
    expect(res.requestId).toBeTruthy();
  });

  it("401 → ровно один refresh → повтор исходного запроса с тем же operation ID; второй 401 → ошибка", async () => {
    const ff = fakeFetch((call) => {
      if (call.url.endsWith("/api/users/authenticate"))
        return jsonResponse({ accessToken: "acc-1", refreshToken: "ref-1" });
      if (call.url.endsWith("/api/users/tokens/refresh")) {
        expect(call.headers["content-type"]).toContain(
          "application/x-www-form-urlencoded"
        );
        expect(call.body).toContain("refreshToken=ref-1");
        return jsonResponse({ accessToken: "acc-2", refreshToken: "ref-2" });
      }
      if (call.url.endsWith("/api/orders")) {
        const n = ff.calls.filter((c) => c.url.endsWith("/api/orders")).length;
        return n === 1
          ? jsonResponse({ message: "unauthorized" }, 401)
          : jsonResponse({ orderId: "mpt-order-1", status: "CREATED" });
      }
      throw new Error(`unexpected url: ${call.url}`);
    });
    const adapter = makeAdapter(ff);
    const res = await adapter.createOrder({
      orderId: "order-42",
      tenantId: "t1",
      gtin: "4601005000001",
      quantity: 10,
      serialNumberType: "OPERATOR",
      cisType: "UNIT",
      isPaid: true,
    });
    expect(res.status).toBe("CREATED");
    const orders = ff.calls.filter((c) => c.url.endsWith("/api/orders"));
    expect(orders).toHaveLength(2);
    // тот же operation ID в повторе
    expect(orders[0].headers["idempotency-key"]).toBe(
      orders[1].headers["idempotency-key"]
    );
    const refreshes = ff.calls.filter((c) =>
      c.url.endsWith("/api/users/tokens/refresh")
    );
    expect(refreshes).toHaveLength(1);
    // второй refresh не происходит при повторном 401
    const ff2 = fakeFetch((call) => {
      if (call.url.endsWith("/api/users/authenticate"))
        return jsonResponse({ accessToken: "acc-1", refreshToken: "ref-1" });
      if (call.url.endsWith("/api/users/tokens/refresh"))
        return jsonResponse({ accessToken: "acc-2" });
      return jsonResponse({ message: "nope" }, 401);
    });
    const adapter2 = makeAdapter(ff2);
    await expect(
      adapter2.createOrder({
        orderId: "o1",
        tenantId: "t1",
        gtin: "4601005000001",
        quantity: 1,
        serialNumberType: "OPERATOR",
        cisType: "UNIT",
        isPaid: true,
      })
    ).rejects.toThrow();
    expect(
      ff2.calls.filter((c) => c.url.endsWith("/api/users/tokens/refresh"))
    ).toHaveLength(1);
  });

  it("backoff+jitter: 503 и network-ошибка → ретрай → успех; 4xx не ретраится", async () => {
    // 503 → retry → 200
    const ff = fakeFetch((call) => {
      if (call.url.endsWith("/api/users/authenticate"))
        return jsonResponse({ accessToken: "acc-1", refreshToken: "ref-1" });
      const n = ff.calls.filter((c) => c.url.endsWith("/api/orders")).length;
      return n === 1
        ? new Response("Service Unavailable", { status: 503 })
        : jsonResponse({ orderId: "x", status: "CREATED" });
    });
    const adapter = makeAdapter(ff);
    await adapter.createOrder({
      orderId: "o1",
      tenantId: "t1",
      gtin: "4601005000001",
      quantity: 1,
      serialNumberType: "OPERATOR",
      cisType: "UNIT",
      isPaid: true,
    });
    expect(ff.calls.filter((c) => c.url.endsWith("/api/orders"))).toHaveLength(
      2
    );

    // network reject → retry → успех
    let rejects = 1;
    const ff2 = fakeFetch(async (call) => {
      if (call.url.endsWith("/api/users/authenticate"))
        return jsonResponse({ accessToken: "acc-1", refreshToken: "ref-1" });
      if (call.url.endsWith("/api/orders") && rejects-- > 0) {
        throw new TypeError("fetch failed: ECONNREFUSED");
      }
      return jsonResponse({ orderId: "x", status: "CREATED" });
    });
    const adapter2 = makeAdapter(ff2);
    await adapter2.createOrder({
      orderId: "o1",
      tenantId: "t1",
      gtin: "4601005000001",
      quantity: 1,
      serialNumberType: "OPERATOR",
      cisType: "UNIT",
      isPaid: true,
    });
    expect(ff2.calls.filter((c) => c.url.endsWith("/api/orders"))).toHaveLength(
      2
    );

    // 400 → без ретрая и permanent-ошибка с телом в message
    const ff3 = fakeFetch((call) => {
      if (call.url.endsWith("/api/users/authenticate"))
        return jsonResponse({ accessToken: "acc-1", refreshToken: "ref-1" });
      return jsonResponse({ message: "bad request" }, 400);
    });
    const adapter3 = makeAdapter(ff3);
    let err3: unknown;
    try {
      await adapter3.createOrder({
        orderId: "o1",
        tenantId: "t1",
        gtin: "4601005000001",
        quantity: 1,
        serialNumberType: "OPERATOR",
        cisType: "UNIT",
        isPaid: true,
      });
    } catch (e) {
      err3 = e;
    }
    expect(err3).toBeTruthy();
    expect((err3 as { permanent?: boolean }).permanent).toBe(true);
    expect(String((err3 as Error).message)).toContain("bad request");
    expect(ff3.calls.filter((c) => c.url.endsWith("/api/orders"))).toHaveLength(
      1
    );
  });

  it("canonicalJson: ключи отсортированы A–Z рекурсивно; массив кодов as-is", () => {
    const json = canonicalJson({
      withdrawalReason: "DEFECT",
      codes: ["c2", "c1"],
      withdrawalType: "WRITE_OFF",
      customsDeclaration: {
        number: "123",
        date: "2026-01-01",
      },
    });
    expect(json).toBe(
      '{"codes":["c2","c1"],"customsDeclaration":{"date":"2026-01-01","number":"123"},"withdrawalReason":"DEFECT","withdrawalType":"WRITE_OFF"}'
    );
  });

  it("submitImport: documentBody = base64(JSON, ключи A–Z); path /public/api/v1/doc/import", async () => {
    const ff = fakeFetch((call) => {
      if (call.url.endsWith("/api/users/authenticate"))
        return jsonResponse({ accessToken: "acc-1", refreshToken: "ref-1" });
      if (call.url.endsWith("/public/api/v1/doc/import")) {
        expect(call.headers.accept).toBe("*/*");
        const body = JSON.parse(call.body ?? "{}");
        const decoded = JSON.parse(
          Buffer.from(body.documentBody, "base64").toString("utf8")
        );
        // ключи объекта отсортированы A–Z; массив кодов AS-IS (ЛОВУШКА 4)
        expect(Object.keys(decoded).sort()).toEqual(Object.keys(decoded));
        expect(decoded.codes).toEqual(["c2", "c1"]);
        expect(decoded.customsDeclaration.number).toBe("12345678");
        return jsonResponse({
          documentId: "doc-1",
          status: "IN_PROCESS",
        });
      }
      throw new Error(`unexpected url: ${call.url}`);
    });
    const adapter = makeAdapter(ff);
    const res = await adapter.submitImport({
      tenantId: "t1",
      codes: ["c2", "c1"],
      customsDate: "2026-08-01",
      customsNumber: "12345678",
    });
    expect(res.status).toBe("IN_PROCESS");
    expect(res.documentId).toBe("doc-1");
  });

  it("toInt32: нормализует string/float, бросает на не-числе, отрицательных и вне диапазона", () => {
    expect(toInt32("1")).toBe(1);
    expect(toInt32(1.9)).toBe(1);
    expect(() => toInt32("abc")).toThrow();
    expect(() => toInt32(-5)).toThrow();
    expect(() => toInt32(2 ** 40)).toThrow();
  });

  it("submitUtilisation: businessPlaceId int32 в теле; отсутствие → ошибка", async () => {
    const ff = fakeFetch((call) => {
      if (call.url.endsWith("/api/users/authenticate"))
        return jsonResponse({ accessToken: "acc-1", refreshToken: "ref-1" });
      if (call.url.endsWith("/api/utilisation")) {
        const body = JSON.parse(call.body ?? "{}");
        expect(body.businessPlaceId).toBe(3);
        expect(body.sntins).toEqual(["s1"]);
        return jsonResponse({ reportId: "rep-1", status: "IN_PROCESS" });
      }
      throw new Error(`unexpected url: ${call.url}`);
    });
    const adapter = makeAdapter(ff);
    const res = await adapter.submitUtilisation({
      tenantId: "t1",
      sntins: ["s1"],
      businessPlaceId: 3.9, // 3.9 → int32 3
      releaseType: "PRODUCTION",
      expirationDate: "2027-01-01",
      productionDate: "2026-01-01",
      manufacturerCountry: "KZ",
    });
    expect(res.reportId).toBe("rep-1");
  });

  // Контракт-скелет против test.markirovka.kz: запускается ТОЛЬКО при
  // явном opt-in (RUN_MPT_STAGE_CONTRACT=true). Никогда не зависит от
  // внешней доступности в npm test.
  const itStage = process.env.RUN_MPT_STAGE_CONTRACT === "true" ? it : it.skip;
  itStage(
    "контракт: authenticate → createOrder → getOrder против реального STAGE",
    async () => {
      const adapter = new HttpMptAdapter(
        buildAppConfig({
          APP_ENV: "test",
          MPT_BASE_URL: process.env.MPT_BASE_URL ?? "",
          MPT_LOGIN: process.env.MPT_LOGIN ?? "",
          MPT_PASSWORD: process.env.MPT_PASSWORD ?? "",
          MPT_MAX_RETRIES: "1",
        }),
        undefined as never,
        createMptWritePolicy({ mptWriteEnabled: true })
      );
      const res = await adapter.createOrder({
        orderId: `contract-${Date.now()}`,
        tenantId: "contract-test",
        gtin: process.env.MPT_TEST_GTIN ?? "4601005000001",
        quantity: 1,
        serialNumberType: "OPERATOR",
        cisType: "UNIT",
        isPaid: true,
      });
      expect(["CREATED", "PENDING", "READY", "REJECTED"]).toContain(res.status);
    },
    30000
  );
});

// ---- e2e: корреляция в outbox (correlationId / attempt / requestId) ----
describe("outbox correlation via OutboxPoller (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "mpt-cor-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.DEMO_ENABLED = "true";
    process.env.OUTBOX_POLL_MS = "50";
    process.env.ADAPTERS_MPT = "mock"; // пин: dev .env с =http не переворачивает e2e
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
      data: { bin: "777000999888", name: "КорТен", status: "ACTIVE" },
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
        amount: BigInt(500000),
        reason: "seed",
      },
    });
    await prisma.account.update({
      where: { id: account.id },
      data: { balance: BigInt(500000) },
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

  it("sendToMpt дополняет payload outbox: correlationId, attempt>=1, requestId", async () => {
    // карточка (валидный GTIN mod10)
    const gtin = validGtin();
    const cardRes = await request(app.getHttpServer())
      .post("/products/cards")
      .set("Authorization", `Bearer ${token}`)
      .send({
        gtin,
        attributes: {
          schemaVersion: 1,
          gtin,
          name: "RAVENOL 5W-30",
          brand: "BRX",
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
      });
    expect(cardRes.status).toBe(201);

    const key = `corr-${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post("/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({
        cardId: (await prisma.productCard.findFirst())!.id,
        gtin,
        places: 1,
        unitsPerPlace: 2,
      })
      .expect(201);
    const orderId = res.body.id;

    // поллер (OUTBOX_POLL_MS=50) обработает send-order-to-mpt
    await sleep(600);

    const row = await prisma.outbox.findFirst({
      where: { aggregate: "send-order-to-mpt" },
      orderBy: { createdAt: "desc" },
    });
    expect(row).toBeTruthy();
    const payload = row!.payload as {
      correlationId?: string;
      attempt?: number;
      requestId?: string | null;
      orderId?: string;
    };
    expect(payload.orderId).toBe(orderId);
    expect(payload.correlationId).toBeTruthy();
    expect(payload.attempt).toBeGreaterThanOrEqual(1);
    // mock-адаптер не возвращает requestId → null; http-адаптер вернёт uuid
    expect("requestId" in payload).toBe(true);
  });
});
