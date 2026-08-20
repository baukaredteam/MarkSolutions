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

// W0-02R: behavioral bootstrap validation. No static text assertions about
// implementation; instead the safe harness is exercised against a disposable PG.

describe("TEST_DATABASE_URL safety (behavioral)", () => {
  const prev = process.env.TEST_DATABASE_URL;
  const prevNodeEnv = process.env.NODE_ENV;
  afterAll(() => {
    process.env.TEST_DATABASE_URL = prev;
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("rejects file: URLs", () => {
    process.env.TEST_DATABASE_URL = "file:./x.db";
    expect(() => requireTestDatabaseUrl()).toThrow(/PostgreSQL/);
  });

  it("rejects non-postgres URLs", () => {
    process.env.TEST_DATABASE_URL = "mysql://localhost/x";
    expect(() => requireTestDatabaseUrl()).toThrow(/postgresql/);
  });

  it("rejects URLs without the markflow_test marker", () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@localhost:5432/prod_db";
    expect(() => requireTestDatabaseUrl()).toThrow(/markflow_test/);
  });

  it("allows a URL with the markflow_test marker", () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    expect(() => requireTestDatabaseUrl()).not.toThrow();
  });

  it("requires the markflow_test marker in the database name (exact match)", () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@localhost:5432/markflow";
    expect(() => requireTestDatabaseUrl()).toThrow(/markflow_test/);
  });

  it("rejects stage mode regardless of URL", () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    process.env.NODE_ENV = "stage";
    expect(() => requireTestDatabaseUrl()).toThrow(/stage/);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("rejects production mode regardless of URL", () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test";
    process.env.NODE_ENV = "production";
    expect(() => requireTestDatabaseUrl()).toThrow(/production/);
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("rejects URLs with ?schema= parameter", () => {
    process.env.TEST_DATABASE_URL =
      "postgresql://u:p@localhost:5432/markflow_test?schema=public";
    expect(() => requireTestDatabaseUrl()).toThrow(/schema/);
  });

  it("rejects invalid URLs", () => {
    process.env.TEST_DATABASE_URL = "not-a-url";
    expect(() => requireTestDatabaseUrl()).toThrow(/valid URL/);
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
      // capability assertion: schema is migrated and writable
      const tenant = await prisma.tenant.create({
        data: { bin: "w02r_bootstrap", name: "boot", status: "ACTIVE" },
      });
      expect(tenant.id).toBeTruthy();
      expect(
        await prisma.tenant.count({ where: { bin: "w02r_bootstrap" } })
      ).toBe(1);
      await prisma.$disconnect();

      // teardown drops ONLY the isolated schema
      await teardownTestDatabase(testDb);
    },
    60000
  );

  afterAll(async () => {
    if (testDb) await teardownTestDatabase(testDb).catch(() => {});
  });
});

describe("Order number sequence (W0-02R)", () => {
  const hasDb = !!process.env.TEST_DATABASE_URL;

  (hasDb ? it : it.skip)(
    "order_number_seq exists and produces unique numbers for concurrent inserts",
    async () => {
      const testDb = await createTestDatabase();
      process.env.DATABASE_URL = testDb.databaseUrl;
      const prisma = new PrismaClient();
      try {
        // Verify sequence exists in current schema
        const seq = await prisma.$queryRawUnsafe<{ seqname: string }[]>(
          "SELECT sequencename FROM pg_sequences WHERE sequencename = 'order_number_seq' AND schemaname = current_schema()"
        );
        expect(seq).toHaveLength(1);

        // Create a tenant for FK
        const tenant = await prisma.tenant.create({
          data: { bin: "seq-test", name: "seq", status: "ACTIVE" },
        });

        // Insert 30 orders concurrently — all should get unique numbers
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
        expect(unique.size).toBe(30); // all unique
        expect(Math.min(...numbers)).toBeGreaterThan(0); // no zero

        // Verify sequence advanced past max
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
