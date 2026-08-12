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

process.env.DEMO_ENABLED = "true";

// UI-04: GET /products/cards (list) + GET /products/cards/:id (detail)
describe("products cards list/detail (UI-04)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let tenantId: string;
  let otherTenantId: string;
  let tokenOf: (tid: string) => string;
  let cardId: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cards-"));
    const dbPath = join(dir, "test.db");
    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.KMS_PROFILE = "file";
    process.env.KMS_FILE_DIR = join(dir, "keys");
    process.env.STORAGE_DIR = join(dir, "storage");
    execSync(
      "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma",
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
        stdio: "pipe",
      }
    );
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    tokenOf = (tid: string) =>
      jwt.sign({
        sub: "u1",
        tenantId: tid,
        roles: ["admin"],
        mfaCompleted: true,
      });

    const t1 = await prisma.tenant.create({
      data: { bin: "777000111222", name: "КартТен", status: "ACTIVE" },
    });
    tenantId = t1.id;
    const t2 = await prisma.tenant.create({
      data: { bin: "777000111333", name: "Чужой", status: "ACTIVE" },
    });
    otherTenantId = t2.id;

    const card = await prisma.productCard.create({
      data: {
        tenantId,
        gtin: "04014835723399",
        status: "REGISTERED",
        ntin: "KZ-MO-0001",
        attributes: {
          schemaVersion: 1,
          name: "Масло моторное MarkOil 5W-30",
          group: "Моторные масла",
          gtin: "04014835723399",
        },
        audit: [{ at: "2026-08-01T10:00:00Z", actor: "u1", action: "submit" }],
      },
    });
    cardId = card.id;
  }, 30000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("GET /products/cards: tenant-список с id/name/gtin/ntin/status/updatedAt, sort desc", async () => {
    const res = await request(app.getHttpServer())
      .get("/products/cards")
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`)
      .expect(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    const row = res.body.items.find((c: { id: string }) => c.id === cardId);
    expect(row).toBeTruthy();
    expect(row.name).toContain("MarkOil");
    expect(row.gtin).toBe("04014835723399");
    expect(row.ntin).toBe("KZ-MO-0001");
    expect(row.status).toBe("REGISTERED");
    expect(row.updatedAt).toBeTruthy();
    // sort desc по updatedAt
    const dates = res.body.items.map((c: { updatedAt: string }) =>
      new Date(c.updatedAt).getTime()
    );
    for (let i = 1; i < dates.length; i++)
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
  });

  it("GET /products/cards: чужой tenant не видит карточки (нет в списке)", async () => {
    const res = await request(app.getHttpServer())
      .get("/products/cards")
      .set("Authorization", `Bearer ${tokenOf(otherTenantId)}`)
      .expect(200);
    expect(res.body.items.some((c: { id: string }) => c.id === cardId)).toBe(
      false
    );
  });

  it("GET /products/cards/:id: attributes + audit + status", async () => {
    const res = await request(app.getHttpServer())
      .get(`/products/cards/${cardId}`)
      .set("Authorization", `Bearer ${tokenOf(tenantId)}`)
      .expect(200);
    expect(res.body.attributes.name).toContain("MarkOil");
    expect(res.body.status).toBe("REGISTERED");
    expect(res.body.audit.length).toBeGreaterThan(0);
  });

  it("GET /products/cards/:id: чужой tenant → 404 (IDOR)", async () => {
    await request(app.getHttpServer())
      .get(`/products/cards/${cardId}`)
      .set("Authorization", `Bearer ${tokenOf(otherTenantId)}`)
      .expect(404);
  });
});
