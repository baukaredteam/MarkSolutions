import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma.service";
import { provisionTenant } from "../src/provisioning";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

// W0-03a pt3 — Stage A red-capable reproductions. Each test names an exact
// defect and must be RED before the corresponding fix lands.

describe("W0-03a pt3 red repros", () => {
  let testDb: TestDb;
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  const repoRoot = join(__dirname, "..", "..", "..");

  let tenantA: { id: string };
  let leA: { id: string };
  let leB: { id: string };
  let tokenA: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.MFA_ENABLED = "false";

    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    // Two tenants, two legal entities, one same-tenant membership per LE pair:
    // tenantA hosts LE-A and LE-B (both belong to tenantA); the active user
    // session is scoped to LE-A only.
    tenantA = await prisma.tenant.create({
      data: { bin: `red-a-${Date.now()}`, name: "Red A" },
    });
    leA = await prisma.legalEntity.create({
      data: {
        tenantId: tenantA.id,
        bin: `red-a-le1-${Date.now()}`,
        name: "LE A",
      },
    });
    leB = await prisma.legalEntity.create({
      data: {
        tenantId: tenantA.id,
        bin: `red-a-le2-${Date.now()}`,
        name: "LE B",
      },
    });
    const u = await prisma.user.create({
      data: {
        tenantId: tenantA.id,
        login: `red-u-${Date.now()}`,
        passwordHash: "x",
        roles: JSON.stringify(["admin"]),
      },
    });
    await prisma.userLegalEntityMembership.create({
      data: { userId: u.id, legalEntityId: leA.id },
    });
    tokenA = jwt.sign({
      sub: u.id,
      tenantId: tenantA.id,
      roles: ["admin"],
      mfaCompleted: true,
      activeLegalEntityId: leA.id,
    });

    void tenantA;
  });

  afterAll(async () => {
    await app.close().catch(() => {});
    await teardownTestDatabase(testDb).catch(() => {});
  });

  it("(1) LE-A session cannot read a card owned by LE-B (same tenant)", async () => {
    const cardB = await prisma.productCard.create({
      data: {
        tenantId: tenantA.id,
        legalEntityId: leB.id,
        status: "DRAFT",
        attributes: { name: "LE-B secret" },
      },
    });
    const res = await request(app.getHttpServer())
      .get(`/products/cards/${cardB.id}`)
      .set("Authorization", `Bearer ${tokenA}`);
    expect([403, 404]).toContain(res.status);
  });

  it("(2) FilesService.clone emits ProductCard WITH the active legalEntityId", async () => {
    const src = await prisma.productCard.create({
      data: {
        tenantId: tenantA.id,
        legalEntityId: "le-" + tenantA.id,
        legalEntityId: leA.id,
        status: "DRAFT",
        attributes: { name: "src" },
      },
    });
    const res = await request(app.getHttpServer())
      .post(`/products/cards/${src.id}/clone`)
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(201);
    expect(res.body.legalEntityId ?? null).toBe(leA.id);
  });

  it("(3) provisionTenant creates Account WITH legalEntityId on first commit", async () => {
    const fresh = new PrismaClient({
      datasources: { db: { url: testDb.databaseUrl } },
    });
    try {
      const { tenantId } = await provisionTenant(fresh, {
        bin: `red-prov-${Date.now()}`,
        name: "Prov",
        adminLogin: `red-admin-${Date.now()}`,
        adminPasswordHash: "x",
      });
      const account = await fresh.account.findFirstOrThrow({
        where: { tenantId },
      });
      expect(account.legalEntityId ?? null).not.toBeNull();
    } finally {
      await fresh.$disconnect();
    }
  });

  it("(4) OrderLine cannot reference another tenant's legal entity", async () => {
    const other = await prisma.tenant.create({
      data: { bin: `red-other-${Date.now()}`, name: "Other" },
    });
    const leOther = await prisma.legalEntity.create({
      data: {
        tenantId: other.id,
        bin: `red-other-le-${Date.now()}`,
        name: "Other LE",
      },
    });
    const order = await prisma.order.create({
      data: {
        tenantId: tenantA.id,
        legalEntityId: "le-" + tenantA.id,
        legalEntityId: leA.id,
        status: "COMPLETED",
        idempotencyKey: `red-ol-${Date.now()}`,
      },
    });
    const tariff = await prisma.tariff.create({
      data: {
        validFrom: new Date("2020-01-01"),
        validTo: new Date("2030-01-01"),
        pricePerCodeKZT: BigInt(100),
      },
    });
    const card = await prisma.productCard.create({
      data: {
        tenantId: tenantA.id,
        legalEntityId: "le-" + tenantA.id,
        legalEntityId: leA.id,
        status: "DRAFT",
        attributes: {},
      },
    });
    await expect(
      prisma.orderLine.create({
        data: {
          orderId: order.id,
          tenantId: tenantA.id,
          legalEntityId: leOther.id, // ����� ������ � ����������� composite FK
          cardId: card.id,
          gtin: "04014835723399",
          places: 1,
          unitsPerPlace: 1,
          quantity: 1,
          totalPrice: BigInt(100),
          tariffId: tariff.id,
          pricePerCodeKZT: BigInt(100),
        },
      })
    ).rejects.toThrow(/foreign key|constraint/i);
  });

  it("(5) local bootstrap never prints a raw restricted/root token", () => {
    const up = readFileSync(
      join(repoRoot, "scripts", "local-stack-up.ps1"),
      "utf8"
    );
    expect(up).not.toMatch(/RESTRICTED_ADAPTER_TOKEN=\$\{?restricted/i);
    expect(up).not.toMatch(/Write-Host[^\n]*\$restricted\b/);
    // fingerprint form is allowed, raw value is not
    expect(up).not.toMatch(
      /Write-(Host|Output)[^\n]*\$\{(root|restricted)Token\}/i
    );
  });
});
