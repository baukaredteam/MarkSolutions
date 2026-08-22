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
import { KMS_ADAPTER } from "../src/kms.adapter";

process.env.DEMO_ENABLED = "true";
process.env.SIM_MPT_EMISSION_MS = "100";
process.env.OUTBOX_POLL_MS = "50";
process.env.MPT_POLL_MS = "50";
process.env.MPT_ORDER_TIMEOUT_MS = "5000";

describe("dashboard summary + w4-seed (W4-06, Q10, ADR-025)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "dash-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = join(dir, "keys");
    process.env.STORAGE_DIR = join(dir, "storage");
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
      data: { bin: "777000111222", name: "ДашТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
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

  async function makeCode(status = "ACTIVE"): Promise<string> {
    const kms = app.get(KMS_ADAPTER);
    const { ciphertext } = await kms.encrypt(
      Buffer.from(
        JSON.stringify({ serial: "0002001", ai91: null, ai92: null })
      ),
      {
        organizationId: tenantId,
        legalEntityId: tenantId,
        objectId: "dash-code",
      }
    );
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        orderId: "o-dash-1",
        gtin: "04014835723399",
        mask: "04014835723399:00…01",
        status,
        ciphertext: ciphertext.toString("base64"),
      },
    });
    return code.id;
  }

  it("summary: 5 счётчиков, открытый в MVP openAggregates=0; tenant-scoped", async () => {
    await makeCode("ACTIVE");
    await makeCode("PRINTED");
    const res = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const body = res.body;
    expect(typeof body.codesNotApplied).toBe("number");
    expect(body.codesNotApplied).toBe(2);
    expect(body.openAggregates).toBe(0); // тикет 03 не готов (MVP)
    expect(typeof body.deadlineSoon).toBe("number");
    expect(typeof body.docsPendingDt).toBe("number");
    expect(typeof body.exceptions).toBe("number");
    expect(body.openAggregates).toBe(0);
  });

  it("w4-seed: создаёт APPLIED-коды, сдвигает updatedAt заказа, EXPECTED-ДТ, outbox FAILED, WithdrawalDocument; идемпотентен", async () => {
    // подготовить заказ
    await prisma.order.create({
      data: {
        id: "o-seed-1",
        number: 101,
        tenantId,
        status: "COMPLETED",
        idempotencyKey: "seed-order-1",
      },
    });
    // до seed: summary имеет только то, что создали предыдущие тесты
    const res0 = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const before = res0.body;
    expect(before.docsPendingDt).toBe(0);
    expect(before.exceptions).toBe(0);

    // seed
    const seed = await request(app.getHttpServer())
      .post("/demo/w4-seed")
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(seed.body).toBeTruthy();

    // счётчики стали ненулевыми
    const res1 = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res1.body.codesNotApplied).toBeGreaterThanOrEqual(2);
    expect(res1.body.docsPendingDt).toBeGreaterThanOrEqual(1);
    expect(res1.body.exceptions).toBeGreaterThanOrEqual(1);
    expect(res1.body.deadlineSoon).toBeGreaterThanOrEqual(1);

    // идемпотентность: повторный seed не плодит
    await request(app.getHttpServer())
      .post("/demo/w4-seed")
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    const res2 = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res2.body.codesNotApplied).toBe(res1.body.codesNotApplied);
    expect(res2.body.docsPendingDt).toBe(res1.body.docsPendingDt);
  });

  it("summary deadlineSoon: заказ с дедлайном ≤7 дней от updatedAt; без кодов UTILISED", async () => {
    const order = await prisma.order.create({
      data: {
        id: "o-deadline",
        number: 102,
        tenantId,
        status: "COMPLETED",
        idempotencyKey: "deadline-order",
        updatedAt: new Date(Date.now() - 24 * 86400000), // 24 дня назад
      },
    });
    void order;
    await makeCode("ACTIVE");
    const res = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.deadlineSoon).toBeGreaterThanOrEqual(1);
  });

  it("documents: типы только IMPORT|WITHDRAWAL|UTILISATION (без SERVICE_ACT_EXPORT в MVP), desc", async () => {
    const c1 = await makeCode("APPLIED");
    await request(app.getHttpServer())
      .post("/withdrawal")
      .set("Authorization", `Bearer ${token}`)
      .send({
        codes: [c1],
        withdrawalType: "WRITE_OFF",
        withdrawalReason: "DEFECT",
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get("/documents")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const types = new Set(res.body.items.map((d: { type: string }) => d.type));
    expect(types.has("SERVICE_ACT_EXPORT")).toBe(false); // тикет 05 не готов
    expect(types.has("WITHDRAWAL")).toBe(true);
    // desc сортировка
    const dates = res.body.items.map((d: { date: string }) =>
      new Date(d.date).getTime()
    );
    for (let i = 1; i < dates.length; i++)
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
  });

  it("степпер-флаги (UI-03): пустой tenant → все false; после данных → прогрессия по порядку", async () => {
    // новый пустой tenant
    const tEmpty = await prisma.tenant.create({
      data: { bin: "777000111999", name: "Пустой", status: "ACTIVE" },
    });
    const tokenEmpty = app.get(JwtService).sign({
      sub: "u-empty",
      tenantId: tEmpty.id,
      roles: ["admin"],
      mfaCompleted: true,
    });
    const s0 = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${tokenEmpty}`)
      .expect(200);
    expect(s0.body.hasCards).toBe(false);
    expect(s0.body.hasRegistered).toBe(false);
    expect(s0.body.hasOrders).toBe(false);
    expect(s0.body.hasPrinted).toBe(false);
    expect(s0.body.hasApplied).toBe(false);
    expect(s0.body.hasIntroduced).toBe(false);

    // прогрессия: карточка → registered → заказ → PRINTED → APPLIED → INTRODUCED
    const card = await prisma.productCard.create({
      data: {
        tenantId,
        gtin: "04014835723399",
        status: "REGISTERED",
        attributes: { name: "Test" },
      },
    });
    await prisma.order.create({
      data: {
        id: "o-flags",
        number: 103,
        tenantId,
        status: "COMPLETED",
        idempotencyKey: "flags-order",
      },
    });
    const kms = app.get(KMS_ADAPTER);
    const { ciphertext } = await kms.encrypt(
      Buffer.from(
        JSON.stringify({ serial: "9000001", ai91: null, ai92: null })
      ),
      {
        organizationId: tenantId,
        legalEntityId: tenantId,
        objectId: "flags-code",
      }
    );
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        orderId: "o-flags",
        gtin: "04014835723399",
        mask: "04014835723399:90…01",
        status: "PRINTED",
        ciphertext: ciphertext.toString("base64"),
        cardId: card.id,
      },
    });
    await prisma.codeEvent.create({
      data: {
        tenantId,
        codeId: code.id,
        event: "PRINTED",
        at: new Date(),
        actor: "u1",
      },
    });
    await prisma.codeEvent.create({
      data: {
        tenantId,
        codeId: code.id,
        event: "APPLIED",
        at: new Date(),
        actor: "u1",
      },
    });
    await prisma.codeEvent.create({
      data: {
        tenantId,
        codeId: code.id,
        event: "INTRODUCED",
        at: new Date(),
        actor: "u1",
      },
    });
    const s1 = await request(app.getHttpServer())
      .get("/dashboard/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(s1.body.hasCards).toBe(true);
    expect(s1.body.hasRegistered).toBe(true);
    expect(s1.body.hasOrders).toBe(true);
    expect(s1.body.hasPrinted).toBe(true);
    expect(s1.body.hasApplied).toBe(true);
    expect(s1.body.hasIntroduced).toBe(true);
  });
});
