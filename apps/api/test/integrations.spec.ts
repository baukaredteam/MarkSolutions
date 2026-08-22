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

describe("W5-02: статусы интеграций", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "int-"));
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
      data: { bin: "777000111222", name: "ИнтТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
    // метрики ИС МПТ: 1 PENDING, 1 FAILED, 1 PROCESSED
    await prisma.outbox.create({
      data: {
        aggregate: "send-order-to-mpt",
        status: "PENDING",
        payload: { tenantId, orderId: "o1" },
      },
    });
    await prisma.outbox.create({
      data: {
        aggregate: "mpt-order-timeout",
        status: "FAILED",
        payload: { tenantId, orderId: "o2" },
      },
    });
    await prisma.outbox.create({
      data: {
        aggregate: "send-order-to-mpt",
        status: "PROCESSED",
        payload: { tenantId, orderId: "o3" },
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

  it("GET /integrations/status — 5 систем, MPT метрики из outbox", async () => {
    const res = await request(app.getHttpServer())
      .get("/integrations/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain("mpt");
    expect(ids).toContain("nkt");
    expect(ids).toContain("gs1");
    expect(ids).toContain("1c");
    expect(ids).toContain("1ecom");
    const mpt = res.body.items.find((i: { id: string }) => i.id === "mpt");
    expect(mpt.queue).toBe(1); // PENDING
    expect(mpt.errors).toBeGreaterThan(0); // FAILED mpt-order-timeout
    for (const s of res.body.items) {
      expect(typeof s.mode).toBe("string");
    }
  });
});
