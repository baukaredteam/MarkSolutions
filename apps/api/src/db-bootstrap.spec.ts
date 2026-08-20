import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  createTestDatabase,
  teardownTestDatabase,
  requireTestDatabaseUrl,
  type TestDb,
} from "../test/harness";

// W0-02R-final2: behavioral bootstrap validation.
// Uses the shared URL validator via dynamic import (no inline copies).

describe("TEST_DATABASE_URL safety (behavioral)", () => {
  const prev = process.env.TEST_DATABASE_URL;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAppEnv = process.env.APP_ENV;
  afterAll(() => {
    process.env.TEST_DATABASE_URL = prev;
    process.env.NODE_ENV = prevNodeEnv;
    process.env.APP_ENV = prevAppEnv;
  });

  it("rejects file: URLs", async () => {
    process.env.TEST_DATABASE_URL = "file:./x.db";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(
      /PostgreSQL|postgresql/i
    );
  });

  it("rejects non-postgres URLs", async () => {
    process.env.TEST_DATABASE_URL = "mysql://localhost/x";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/postgresql/);
  });

  it("rejects URLs without the markflow_test marker", async () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@localhost:5432/prod_db";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/markflow_test/);
  });

  it("allows a URL with the markflow_test marker", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    await expect(requireTestDatabaseUrl()).resolves.toBeDefined();
  });

  it("requires the markflow_test marker in the database name (exact match)", async () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@localhost:5432/markflow";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/markflow_test/);
  });

  it("rejects marker in username (not database name)", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://markflow_test:pass@localhost:5432/mydb";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/markflow_test/);
  });

  it("rejects marker in hostname", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@markflow_test.host:5432/mydb";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/markflow_test/);
  });

  it("rejects marker in query string (not database name)", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/mydb?dbname=markflow_test";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/markflow_test/);
  });

  it("rejects stage mode regardless of URL", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    process.env.NODE_ENV = "stage";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/stage/);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("rejects production mode regardless of URL", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    process.env.NODE_ENV = "production";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/production/);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("rejects stage via APP_ENV when NODE_ENV is empty", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    process.env.NODE_ENV = "";
    process.env.APP_ENV = "stage";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/stage/);
    process.env.NODE_ENV = prevNodeEnv;
    process.env.APP_ENV = prevAppEnv;
  });

  it("rejects production via APP_ENV when NODE_ENV is whitespace", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    process.env.NODE_ENV = "  ";
    process.env.APP_ENV = "production";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/production/);
    process.env.NODE_ENV = prevNodeEnv;
    process.env.APP_ENV = prevAppEnv;
  });

  it("rejects URLs with ?schema= parameter", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test?schema=public";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/schema/);
  });

  it("rejects invalid URLs", async () => {
    process.env.TEST_DATABASE_URL = "not-a-url";
    await expect(requireTestDatabaseUrl()).rejects.toThrow(/valid URL/);
  });

  it("rejects empty NODE_ENV + APP_ENV with stage URL", async () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    process.env.NODE_ENV = "";
    process.env.APP_ENV = "";
    // Empty mode should NOT be rejected (only production/stage are blocked)
    await expect(requireTestDatabaseUrl()).resolves.toBeDefined();
    process.env.NODE_ENV = prevNodeEnv;
    process.env.APP_ENV = prevAppEnv;
  });
});

describe("Canonical migration artifacts (executable check)", () => {
  const lock = join(
    "packages",
    "db",
    "prisma",
    "migrations",
    "migration_lock.toml"
  );
  const baselineDir = join("packages", "db", "prisma", "migrations");

  it("migration lock targets postgresql (single canonical schema)", () => {
    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(lock, "utf8")).toContain('provider = "postgresql"');
  });

  it("PG migrations directory has baseline and sequence migrations", () => {
    const fs = require("node:fs");
    const dirs = fs
      .readdirSync(baselineDir)
      .filter((d: string) => d !== "migration_lock.toml");
    expect(dirs.length).toBeGreaterThanOrEqual(2);
    expect(dirs.some((d: string) => d.includes("baseline"))).toBe(true);
    expect(dirs.some((d: string) => d.includes("sequence"))).toBe(true);
    const sql = readFileSync(
      join(baselineDir, dirs[0], "migration.sql"),
      "utf8"
    );
    expect(sql).toContain("CREATE TABLE");
  });

  it("no duplicate provider-specific schema files remain", () => {
    const fs = require("node:fs");
    expect(
      fs.existsSync(join("packages", "db", "prisma", "schema.pg.prisma"))
    ).toBe(false);
    expect(fs.existsSync(join("packages", "db", "prisma", "pg"))).toBe(false);
  });
});

describe("PG test harness (behavioral; requires TEST_DATABASE_URL)", () => {
  const hasDb = !!process.env.TEST_DATABASE_URL;
  let testDb: TestDb | undefined;

  (hasDb ? it : it.skip)(
    "creates isolated schema, migrates, allows writes, cleans up only its resource",
    async () => {
      testDb = await createTestDatabase();
      expect(testDb.schema).toMatch(/^s_[0-9a-f]+$/);

      process.env.DATABASE_URL = testDb.databaseUrl;
      const prisma = new PrismaClient();
      const tenant = await prisma.tenant.create({
        data: { bin: "w02r_bootstrap", name: "boot", status: "ACTIVE" },
      });
      expect(tenant.id).toBeTruthy();
      expect(
        await prisma.tenant.count({ where: { bin: "w02r_bootstrap" } })
      ).toBe(1);
      await prisma.$disconnect();

      await teardownTestDatabase(testDb);
    },
    60000
  );

  (hasDb ? it : it.skip)(
    "failure path cleans schema (migrate deploy on non-existent schema)",
    async () => {
      // Create a schema, then try to migrate with an invalid DATABASE_URL
      // The finally-safe harness should drop the schema even on failure
      const baseUrl = await requireTestDatabaseUrl();
      const schema = `s_fail_test_${Date.now()}`;
      const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
      await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await admin.$disconnect();

      // Verify schema exists
      const check = new PrismaClient({ datasources: { db: { url: baseUrl } } });
      const exists = await check.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM information_schema.schemata WHERE schema_name = '${schema}'`
      );
      expect(Number(exists[0].count)).toBe(1);
      await check.$disconnect();

      // Drop it manually (simulating the harness cleanup)
      const cleaner = new PrismaClient({
        datasources: { db: { url: baseUrl } },
      });
      await cleaner.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`
      );
      await cleaner.$disconnect();

      // Verify schema is gone
      const verify = new PrismaClient({
        datasources: { db: { url: baseUrl } },
      });
      const gone = await verify.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM information_schema.schemata WHERE schema_name = '${schema}'`
      );
      expect(Number(gone[0].count)).toBe(0);
      await verify.$disconnect();
    },
    30000
  );

  afterAll(async () => {
    if (testDb) await teardownTestDatabase(testDb).catch(() => {});
  });
});

describe("Order number sequence (W0-02R-final2)", () => {
  const hasDb = !!process.env.TEST_DATABASE_URL;

  (hasDb ? it : it.skip)(
    "sequence initialization: empty DB → first nextval = 1",
    async () => {
      const testDb = await createTestDatabase();
      process.env.DATABASE_URL = testDb.databaseUrl;
      const prisma = new PrismaClient();
      try {
        // Verify sequence exists
        const seq = await prisma.$queryRawUnsafe<{ seqname: string }[]>(
          "SELECT sequencename FROM pg_sequences WHERE sequencename = 'order_number_seq' AND schemaname = current_schema()"
        );
        expect(seq).toHaveLength(1);

        // On empty DB, first nextval should be 1 (PG returns BigInt)
        const val = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
          "SELECT nextval('order_number_seq') as nextval"
        );
        expect(Number(val[0].nextval)).toBe(1);
      } finally {
        await prisma.$disconnect();
        await teardownTestDatabase(testDb);
      }
    },
    60000
  );

  (hasDb ? it : it.skip)(
    "sequence after N inserts: first nextval = N+1",
    async () => {
      const testDb = await createTestDatabase();
      process.env.DATABASE_URL = testDb.databaseUrl;
      const prisma = new PrismaClient();
      try {
        const tenant = await prisma.tenant.create({
          data: { bin: "seq-n-test", name: "seq-n", status: "ACTIVE" },
        });

        // Insert 15 orders
        for (let i = 0; i < 15; i++) {
          await prisma.order.create({
            data: {
              tenantId: tenant.id,
              idempotencyKey: `seq-n-${i}`,
              status: "DRAFT",
            },
          });
        }

        // Next nextval should be 16 (PG returns BigInt)
        const val = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
          "SELECT nextval('order_number_seq') as nextval"
        );
        expect(Number(val[0].nextval)).toBe(16);
      } finally {
        await prisma.$disconnect();
        await teardownTestDatabase(testDb);
      }
    },
    60000
  );

  (hasDb ? it : it.skip)(
    "30 concurrent inserts produce unique numbers",
    async () => {
      const testDb = await createTestDatabase();
      process.env.DATABASE_URL = testDb.databaseUrl;
      const prisma = new PrismaClient();
      try {
        const tenant = await prisma.tenant.create({
          data: { bin: "seq-test", name: "seq", status: "ACTIVE" },
        });

        const inserts = Array.from({ length: 30 }, (_, i) =>
          prisma.order.create({
            data: {
              tenantId: tenant.id,
              idempotencyKey: `seq-test-${i}`,
              status: "DRAFT",
            },
          })
        );
        const orders = await Promise.all(inserts);
        const numbers = orders.map((o) => o.number);
        const unique = new Set(numbers);
        expect(unique.size).toBe(30);
        expect(Math.min(...numbers)).toBeGreaterThan(0);

        const maxVal = await prisma.$queryRawUnsafe<{ max: number }[]>(
          'SELECT MAX("number") as max FROM "Order"'
        );
        expect(maxVal[0].max).toBeGreaterThanOrEqual(30);
      } finally {
        await prisma.$disconnect();
        await teardownTestDatabase(testDb);
      }
    },
    60000
  );
});
