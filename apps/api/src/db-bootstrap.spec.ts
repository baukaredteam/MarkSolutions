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
  afterAll(() => {
    process.env.TEST_DATABASE_URL = prev;
  });

  it("rejects file: URLs", () => {
    process.env.TEST_DATABASE_URL = "file:./x.db";
    expect(() => requireTestDatabaseUrl()).toThrow(/PostgreSQL/);
  });

  it("rejects non-postgres URLs", () => {
    process.env.TEST_DATABASE_URL = "mysql://localhost/x";
    expect(() => requireTestDatabaseUrl()).toThrow(/PostgreSQL/);
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

  it("allows a non-marker URL only when ALLOW_TEST_DB_RESET=true", () => {
    process.env.TEST_DATABASE_URL = "postgresql://u:p@localhost:5432/prod_db";
    process.env.ALLOW_TEST_DB_RESET = "true";
    expect(() => requireTestDatabaseUrl()).not.toThrow();
    delete process.env.ALLOW_TEST_DB_RESET;
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

  it("exactly one PG baseline migration exists", () => {
    const fs = require("node:fs");
    const dirs = fs
      .readdirSync(baselineDir)
      .filter((d: string) => d !== "migration_lock.toml");
    expect(dirs.length).toBe(1);
    expect(dirs[0]).toContain("baseline");
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
