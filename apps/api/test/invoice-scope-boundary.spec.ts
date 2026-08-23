import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

// W0-03a — authorization + payment-boundary red repros.
// (1) Invoice print/confirm/list cross-LE within same tenant → denied
// (2) kaspiWebhook without configured shared secret → fail-closed (404)
// (3) Selection token for deleted user → rejected

describe("W0-03a invoice scope + payment boundary (red)", () => {
  let testDb: TestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  let tenantId = "";
  let leA = "";
  let leB = "";
  let tokenA = "";

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";
    delete process.env.KASPI_WEBHOOK_SECRET;

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    const t = await prisma.tenant.create({
      data: { bin: `inv-bin-${Date.now()}`, name: "Inv Tenant" },
    });
    tenantId = t.id;
    const le1 = await prisma.legalEntity.create({
      data: { tenantId, bin: `inv-le1-${Date.now()}`, name: "LE A" },
    });
    const le2 = await prisma.legalEntity.create({
      data: { tenantId, bin: `inv-le2-${Date.now()}`, name: "LE B" },
    });
    leA = le1.id;
    leB = le2.id;
    const u = await prisma.user.create({
      data: {
        tenantId,
        login: `inv-u-${Date.now()}`,
        passwordHash: "x",
        roles: JSON.stringify(["admin", "accountant"]),
      },
    });
    await prisma.userLegalEntityMembership.create({
      data: { userId: u.id, legalEntityId: leA },
    });
    tokenA = jwt.sign({
      sub: u.id,
      tenantId,
      roles: ["admin", "accountant"],
      mfaCompleted: true,
      activeLegalEntityId: leA,
    });
  });

  afterAll(async () => {
    await app.close().catch(() => {});
    await teardownTestDatabase(testDb).catch(() => {});
  });

  async function createInvoice(le: string) {
    const tariff = await prisma.tariff.create({
      data: {
        validFrom: new Date("2020-01-01"),
        validTo: new Date("2030-01-01"),
        pricePerCodeKZT: BigInt(10000),
        productGroup: "motor-oils",
      },
    });
    void tariff;
    return prisma.invoice.create({
      data: {
        tenantId,
        legalEntityId: le,
        number: Math.floor(Math.random() * 100000) + 10,
        productGroup: "motor-oils",
        quantity: 1,
        unitPrice: BigInt(10000),
        sumWithoutVat: BigInt(10000),
        vat: BigInt(1600),
        sumWithVat: BigInt(11600),
        vatRatePct: 16,
      },
    });
  }

  it("(1a) invoice print: LE-A session cannot read LE-B invoice", async () => {
    const invB = await createInvoice(leB);
    const res = await request(app.getHttpServer())
      .get(`/billing/invoices/${invB.id}/print`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect([403, 404]).toContain(res.status);
  });

  it("(1b) invoice confirm: LE-A session cannot confirm LE-B invoice", async () => {
    const invB = await createInvoice(leB);
    const res = await request(app.getHttpServer())
      .post(`/billing/invoices/${invB.id}/confirm`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ paymentRef: "hijack-1" });
    expect([403, 404]).toContain(res.status);
    // и счёт не оплачен
    const fresh = await prisma.invoice.findUnique({ where: { id: invB.id } });
    expect(fresh?.status).not.toBe("PAID");
  });

  it("(1c) invoice list: LE-A session sees only LE-A invoices", async () => {
    await createInvoice(leA);
    await createInvoice(leB);
    const res = await request(app.getHttpServer())
      .get("/billing/invoices")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);
    const items = res.body.items ?? res.body;
    for (const it of items) {
      expect(it.legalEntityId ?? leA).toBe(leA);
    }
  });

  it("(2) kaspiWebhook without configured secret → fail-closed 404", async () => {
    const inv = await createInvoice(leA);
    const res = await request(app.getHttpServer())
      .post("/billing/providers/kaspi/webhook")
      .send({ invoiceId: inv.id, paymentRef: "anon-topup" });
    expect([403, 404]).toContain(res.status);
    const fresh = await prisma.invoice.findUnique({ where: { id: inv.id } });
    expect(fresh?.status).not.toBe("PAID");
  });

  it("(3) selection token for deleted user is rejected", async () => {
    const selToken = jwt.sign({
      sub: "deleted-user-id",
      tenantId,
      roles: [],
      mfaCompleted: false,
      purpose: "le-select",
      jti: "jti-deleted",
    });
    const res = await request(app.getHttpServer())
      .post("/auth/select-legal-entity")
      .set("Authorization", `Bearer ${selToken}`)
      .send({ legalEntityId: leA });
    expect([401, 403]).toContain(res.status);
  });
});
