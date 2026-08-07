import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

describe("ProductCard + DraftProposal (t3-catalog migration)", () => {
  let dir: string;
  let prisma: PrismaClient;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "t3catalog-"));
    const dbPath = join(dir, "test.db");
    const url = `file:${dbPath}`;
    execSync(
      "npx prisma migrate deploy --schema packages/db/prisma/schema.prisma",
      {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: url },
        stdio: "pipe",
      }
    );
    prisma = new PrismaClient({ adapter: new PrismaLibSQL({ url }) });
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
    await sleep(300);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  it("creates ProductCard with tenant_id, version, status, attributes Json", async () => {
    const tenant = await prisma.tenant.create({
      data: { bin: "999000111222", name: "Тест", status: "ACTIVE" },
    });
    const card = await prisma.productCard.create({
      data: {
        tenantId: tenant.id,
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
        source: "demo-seed",
        proposed: {
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
  });

  it("tenant_id everywhere + duplicate gtin blocked per tenant (neg)", async () => {
    const t1 = await prisma.tenant.create({
      data: { bin: "111000111222", name: "A", status: "ACTIVE" },
    });
    const t2 = await prisma.tenant.create({
      data: { bin: "111000111333", name: "B", status: "ACTIVE" },
    });
    const gtin = "05001234567890"; // уникальный для этого теста
    await prisma.productCard.create({
      data: { tenantId: t1.id, gtin, attributes: { schemaVersion: 1 } },
    });
    // same tenant + same gtin → unique violation
    await expect(
      prisma.productCard.create({
        data: { tenantId: t1.id, gtin, attributes: { schemaVersion: 1 } },
      })
    ).rejects.toThrow();
    // other tenant + same gtin → ok (не дубль у нас)
    await prisma.productCard.create({
      data: { tenantId: t2.id, gtin, attributes: { schemaVersion: 1 } },
    });
    const count = await prisma.productCard.count({ where: { gtin } });
    expect(count).toBe(2);
  });
});
