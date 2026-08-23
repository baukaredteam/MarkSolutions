import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

// W0-03a pt2 (ADR-027) Slice 3 — database scope invariants:
//  (d) a row with tenant A + legal entity of tenant B cannot be persisted;
//  retention: a legal entity with protected evidence cannot be deleted;
//  verification: no protected row references another tenant's legal entity.

describe("W0-03a scope invariants (database level)", () => {
  let testDb: TestDb;
  let prisma: PrismaClient;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    prisma = new PrismaClient({
      datasources: { db: { url: testDb.databaseUrl } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect().catch(() => {});
    await teardownTestDatabase(testDb);
  });

  async function seedTenant(binSuffix: string) {
    const tenant = await prisma.tenant.create({
      data: {
        bin: `fk-bin-${binSuffix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        name: `FK Tenant ${binSuffix}`,
        status: "ACTIVE",
      },
    });
    // harness trigger seeds LegalEntity 'le-'+tenant.id and user 'u1'
    const le = await prisma.legalEntity.findFirstOrThrow({
      where: { tenantId: tenant.id },
    });
    return { tenant, le };
  }

  it("(d) cross-tenant pair (tenant A + LE of tenant B) is rejected by composite FK", async () => {
    const a = await seedTenant("A");
    const b = await seedTenant("B");

    await expect(
      prisma.account.create({
        data: {
          tenantId: a.tenant.id,
          legalEntityId: "le-" + a.tenant.id,
          legalEntityId: b.le.id, // чужое юрлицо
          balance: BigInt(0),
        },
      })
    ).rejects.toThrow(/foreign key|FK|constraint/i);

    // корректная пара проходит
    const ok = await prisma.account.create({
      data: {
        tenantId: a.tenant.id,
        legalEntityId: "le-" + a.tenant.id,
        legalEntityId: a.le.id,
        balance: BigInt(5),
      },
    });
    expect(ok.legalEntityId).toBe(a.le.id);
  });

  it("retention: legal entity with protected evidence cannot be deleted", async () => {
    const t = await seedTenant("R");
    await prisma.codeVault.create({
      data: {
        tenantId: t.tenant.id,
        legalEntityId: "le-" + t.tenant.id,
        legalEntityId: t.le.id,
        orderId: "o-retention",
        gtin: "04014835723399",
        mask: "mask",
        status: "APPLIED",
        ciphertext: "x",
      },
    });
    await expect(
      prisma.legalEntity.delete({ where: { id: t.le.id } })
    ).rejects.toThrow(/foreign key|FK|constraint/i);
  });

  it("verification query: zero protected rows reference another tenant's LE", async () => {
    const tables = [
      "Account",
      "LedgerEntry",
      "Invoice",
      "Product",
      "ProductCard",
      "DraftProposal",
      "Order",
      "CodeVault",
      "CodeEvent",
      "VaultExport",
      "UtilisationReport",
      "ImportDocument",
      "WithdrawalDocument",
      "AggregationUnit",
      "AggregationMember",
    ];
    for (const table of tables) {
      const rows = (await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "${table}" r
         JOIN "LegalEntity" le ON le.id = r."legalEntityId"
         WHERE le."tenantId" <> r."tenantId"`
      )) as Array<{ n: number }>;
      expect(rows[0].n).toBe(0);
    }
  });
});
