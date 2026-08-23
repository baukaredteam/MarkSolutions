import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setTimeout as sleep } from "node:timers/promises";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./test-harness";

describe("ProductCard + DraftProposal (t3-catalog migration)", () => {
  let prisma: PrismaClient;
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    prisma = new PrismaClient();
  }, 120000);

  afterAll(async () => {
    await prisma.$disconnect();
    await sleep(300);
    await teardownTestDatabase(testDb);
  });

  it("creates ProductCard with tenant_id, version, status, attributes Json", async () => {
    const tenant = await prisma.tenant.create({
      data: { bin: "999000111222", name: "Тест", status: "ACTIVE" },
    });
    const card = await prisma.productCard.create({
      data: {
        tenantId: tenant.id,
        legalEntityId: "le-" + tenant.id,
        status: "DRAFT",
        gtin: "04014835723399",
        attributes: {
          schemaVersion: 1,
          gtin: "04014835723399",
          name: "Моторное масло Castrol EDGE 0W-20 C5",
        },
      },
    });
    expect(card.tenantId).toBe(tenant.id);
    expect(card.status).toBe("DRAFT");
    expect((card.attributes as { schemaVersion: number }).schemaVersion).toBe(
      1
    );
    expect(card.gtin).toBe("04014835723399");
  });

  it("DraftProposal carries source, proposed, missing, demo", async () => {
    const tenant = await prisma.tenant.create({
      data: { bin: "999000333444", name: "Тест2", status: "ACTIVE" },
    });
    const prop = await prisma.draftProposal.create({
      data: {
        tenantId: tenant.id,
        legalEntityId: "le-" + tenant.id,
        source: "demo-seed",
        proposed: {
          schemaVersion: 1,
          name: "Nomad Novo 7000",
          tnved: "27101919",
          confidence: 0.8,
        },
        missing: ["gtin", "sae"],
        status: "DOBOR",
        demo: true,
      },
    });
    expect(prop.source).toBe("demo-seed");
    expect(prop.demo).toBe(true);
    expect(prop.missing as string[]).toContain("gtin");
    expect((prop.proposed as { schemaVersion: number }).schemaVersion).toBe(1);
  });

  it("tenant_id everywhere; partial unique index blocks same-tenant active gtin (F1)", async () => {
    const t1 = await prisma.tenant.create({
      data: { bin: "111000111222", name: "A", status: "ACTIVE" },
    });
    const t2 = await prisma.tenant.create({
      data: { bin: "111000111333", name: "B", status: "ACTIVE" },
    });
    const gtin = "05001234567890"; // уникальный для этого теста
    await prisma.productCard.create({
      data: {
        tenantId: t1.id,
        legalEntityId: "le-" + t1.id,
        gtin,
        status: "DRAFT",
        attributes: { schemaVersion: 1 },
      },
    });
    // partial unique index (WHERE status != 'ARCHIVED') → второй активный дубль у tenant отклоняется
    await expect(
      prisma.productCard.create({
        data: {
          tenantId: t1.id,
          legalEntityId: "le-" + t1.id,
          gtin,
          status: "DRAFT",
          attributes: { schemaVersion: 1 },
        },
      })
    ).rejects.toThrow();
    // другой tenant + same gtin → ок (не дубль у нас)
    await prisma.productCard.create({
      data: {
        tenantId: t2.id,
        legalEntityId: "le-" + t2.id,
        gtin,
        status: "DRAFT",
        attributes: { schemaVersion: 1 },
      },
    });
    const count = await prisma.productCard.count({ where: { gtin } });
    expect(count).toBe(2);
  });
});
