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

describe("W5-01: 1ecom импорт товаров", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantId: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ecom-"));
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
      data: { bin: "777000111222", name: "ЭкомТен", status: "ACTIVE" },
    });
    tenantId = tenant.id;
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

  it("GET /products/ecom/products — 5–10 товаров с GTIN/ТНВЭД/наименованием", async () => {
    const res = await request(app.getHttpServer())
      .get("/products/ecom/products")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const items = res.body.items;
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.length).toBeLessThanOrEqual(10);
    for (const it of items) {
      expect(typeof it.gtin).toBe("string");
      expect(typeof it.tnved).toBe("string");
      expect(typeof it.name).toBe("string");
    }
  });

  it("POST /products/ecom/import — создаёт DraftProposal source=1ecom", async () => {
    const list = await request(app.getHttpServer())
      .get("/products/ecom/products")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const res = await request(app.getHttpServer())
      .post("/products/ecom/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: list.body.items.slice(0, 3) })
      .expect(201);
    expect(res.body.created).toBe(3);
    const drafts = await prisma.draftProposal.findMany({
      where: { tenantId, source: "1ecom" },
    });
    expect(drafts.length).toBe(3);
    for (const d of drafts) {
      expect(d.source).toBe("1ecom");
    }
  });
});
