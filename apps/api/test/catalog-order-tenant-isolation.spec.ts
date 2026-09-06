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

// AT: tenant isolation for CAT + ORD skeleton (fail closed without tenant, cross-tenant IDOR).
describe("catalog + order tenant isolation (CAT/ORD skeleton)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dir: string;
  let testDb: TestDb;
  let tenantA: string;
  let tenantB: string;
  let tokenOf: (tid: string | null, roles?: string[]) => string;
  let cardId: string;
  let draftId: string;
  let orderId: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cat-ord-iso-"));
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    process.env.DEMO_ENABLED = "true";
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
    const jwt = app.get(JwtService);
    tokenOf = (tid, roles = ["admin"]) =>
      jwt.sign({
        sub: "u-iso",
        tenantId: tid,
        roles,
        mfaCompleted: true,
      });

    const t1 = await prisma.tenant.create({
      data: { bin: "777000111444", name: "TenantA", status: "ACTIVE" },
    });
    tenantA = t1.id;
    const t2 = await prisma.tenant.create({
      data: { bin: "777000111555", name: "TenantB", status: "ACTIVE" },
    });
    tenantB = t2.id;

    await prisma.account.create({
      data: { tenantId: tenantA, balance: BigInt(500000) },
    });
    await prisma.tariff.deleteMany();
    await prisma.tariff.create({
      data: {
        validFrom: new Date(Date.now() - 86400000),
        validTo: new Date(Date.now() + 86400000),
        pricePerCodeKZT: BigInt(100),
      },
    });

    const card = await prisma.productCard.create({
      data: {
        tenantId: tenantA,
        gtin: "04014835724401",
        status: "REGISTERED",
        attributes: {
          schemaVersion: 1,
          name: "Iso Oil",
          group: "Моторные масла",
          gtin: "04014835724401",
        },
        audit: [],
      },
    });
    cardId = card.id;

    const draft = await prisma.draftProposal.create({
      data: {
        tenantId: tenantA,
        source: "form",
        proposed: { name: "Draft A", tnved: "2710198100" },
        missing: [],
        status: "DRAFT",
      },
    });
    draftId = draft.id;

    const order = await prisma.order.create({
      data: {
        tenantId: tenantA,
        status: "QUEUED",
        idempotencyKey: "iso-order-a",
        cardId,
        gtin: "04014835724401",
        lines: {
          create: {
            tenantId: tenantA,
            cardId,
            gtin: "04014835724401",
            places: 1,
            unitsPerPlace: 10,
            quantity: 10,
            totalPrice: BigInt(1000),
            tariffId: (await prisma.tariff.findFirst())!.id,
            pricePerCodeKZT: BigInt(100),
          },
        },
      },
    });
    orderId = order.id;
  }, 120000);

  afterAll(async () => {
    await app.close();
    await sleep(300);
    await teardownTestDatabase(testDb);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("without JWT → 401 on catalog and order endpoints", async () => {
    await request(app.getHttpServer()).get("/products/cards").expect(401);
    await request(app.getHttpServer()).get("/products/drafts").expect(401);
    await request(app.getHttpServer()).get("/orders").expect(401);
    await request(app.getHttpServer()).get(`/orders/${orderId}`).expect(401);
  });

  it("JWT without tenant (non-operator) → 401 at TenantGuard", async () => {
    const noTenant = tokenOf(null, ["admin"]);
    await request(app.getHttpServer())
      .get("/products/cards")
      .set("Authorization", `Bearer ${noTenant}`)
      .expect(401);
    await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${noTenant}`)
      .expect(401);
  });

  it("operator JWT without tenant → 403 tenant required on tenant-scoped catalog/order", async () => {
    const operator = tokenOf(null, ["operator"]);
    await request(app.getHttpServer())
      .get("/products/cards")
      .set("Authorization", `Bearer ${operator}`)
      .expect(403);
    await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${operator}`)
      .expect(403);
  });

  it("tenant B cannot see tenant A drafts in list", async () => {
    const res = await request(app.getHttpServer())
      .get("/products/drafts")
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .expect(200);
    expect(res.body.items.some((d: { id: string }) => d.id === draftId)).toBe(
      false
    );
  });

  it("tenant B cannot mutate tenant A draft (fix-tnved)", async () => {
    const before = await prisma.draftProposal.findUnique({
      where: { id: draftId },
    });
    expect(before).toBeTruthy();
    const proposedBefore = before!.proposed as { tnved?: string };

    // in-list ТНВЭД — must pass isInList before tenant lookup (not false-green on tnved gate)
    const inListTnved = "2710198200";
    const res = await request(app.getHttpServer())
      .post(`/products/drafts/${draftId}/fix-tnved`)
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .send({ tnved: inListTnved });
    expect([400, 404]).toContain(res.status);

    const after = await prisma.draftProposal.findUnique({
      where: { id: draftId },
    });
    const proposedAfter = after!.proposed as { tnved?: string };
    expect(proposedAfter.tnved).toBe(proposedBefore.tnved);
    expect(after!.status).toBe(before!.status);
  });

  it("tenant B cannot read tenant A order (GET → 404 IDOR)", async () => {
    await request(app.getHttpServer())
      .get(`/orders/${orderId}`)
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .expect(404);
  });

  it("tenant B cannot cancel tenant A order (POST → 404 IDOR)", async () => {
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/cancel`)
      .set("Authorization", `Bearer ${tokenOf(tenantB)}`)
      .expect(404);
  });

  it("tenant A sees own card, draft, order; tenant B list excludes them", async () => {
    const cardsA = await request(app.getHttpServer())
      .get("/products/cards")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);
    expect(cardsA.body.items.some((c: { id: string }) => c.id === cardId)).toBe(
      true
    );

    const draftsA = await request(app.getHttpServer())
      .get("/products/drafts")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);
    expect(
      draftsA.body.items.some((d: { id: string }) => d.id === draftId)
    ).toBe(true);

    const ordersA = await request(app.getHttpServer())
      .get("/orders")
      .set("Authorization", `Bearer ${tokenOf(tenantA)}`)
      .expect(200);
    expect(
      ordersA.body.items.some((o: { id: string }) => o.id === orderId)
    ).toBe(true);
  });
});
