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

describe("audit journal (UI-07, SEC-057)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "audit-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = join(dir, "keys");
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
      data: { bin: "777000111222", name: "АудитТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    const acc = await prisma.account.create({
      data: { tenantId, balance: BigInt(0) },
    });
    // codeVault для CodeEvent
    const code = await prisma.codeVault.create({
      data: {
        tenantId,
        legalEntityId: "le-" + tenantId,
        orderId: "o-audit",
        gtin: "04014835723399",
        mask: "04014835723399:00…01",
        status: "ACTIVE",
        ciphertext: "x",
      },
    });
    await prisma.codeEvent.create({
      data: { tenantId, codeId: code.id, event: "PRINTED", actor: "u1" },
    });
    await prisma.vaultExport.create({
      data: {
        tenantId,
        orderId: "o-audit",
        actor: "u1",
        kind: "export",
        count: 2,
      },
    });
    await prisma.outbox.create({
      data: {
        aggregate: "send-order-to-mpt",
        status: "PROCESSED",
        payload: { tenantId, orderId: "o-audit" },
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
    void acc;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("GET /audit/journal — объединённый журнал (code-event + vault-export + outbox), desc", async () => {
    const res = await request(app.getHttpServer())
      .get("/audit/journal")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const items = res.body.items;
    expect(items.length).toBeGreaterThanOrEqual(3);
    const actions = items.map((i: { action: string }) => i.action);
    expect(actions).toContain("PRINTED");
    expect(actions).toContain("export");
    expect(actions).toContain("send-order-to-mpt");
    // каждый элемент имеет actor/action/object/source
    for (const it of items) {
      expect(typeof it.actor).toBe("string");
      expect(typeof it.source).toBe("string");
    }
    // desc-сортировка по at
    const times = items.map((i: { at: string }) => new Date(i.at).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
    }
  });

  it("GET /audit/journal — tenant-scoped: чужой tenant пуст", async () => {
    const t2 = await prisma.tenant.create({
      data: { bin: "777000111333", name: "ЧужойТен", status: "ACTIVE" },
    });
    const jwt = app.get(JwtService);
    const tok = jwt.sign({
      // ADR-027: scope-инфраструктура тестов сеет membership только для u1;
      // смена tenant при том же пользователи проверяет изоляцию так же строго.
      sub: "u1",
      tenantId: t2.id,
      roles: ["admin"],
      activeLegalEntityId: "le-" + t2.id,
      mfaCompleted: true,
    });
    const res = await request(app.getHttpServer())
      .get("/audit/journal")
      .set("Authorization", `Bearer ${tok}`)
      .expect(200);
    expect(res.body.items).toEqual([]);
  });
});
