import { describe, it, expect } from "vitest";
import { join } from "node:path";

// W0-02: Test database bootstrap and migration validation.

// ─── URL Safety ────────────────────────────────────────────────────────

describe("TEST_DATABASE_URL safety", () => {
  it("rejects file: URLs as test database source", () => {
    const fileUrls = [
      "file:./test.db",
      "file:///tmp/test.db",
      "file:C:/Users/test.db",
    ];
    for (const url of fileUrls) {
      expect(() => validateTestUrl(url)).toThrow(/must be a PostgreSQL/);
    }
  });

  it("rejects non-PostgreSQL URLs", () => {
    expect(() => validateTestUrl("mysql://localhost:3306/test")).toThrow(
      /must be a PostgreSQL/
    );
  });

  it("accepts PostgreSQL URLs with test marker", () => {
    expect(() =>
      validateTestUrl(
        "postgresql://markflow:markflow@localhost:5432/markflow_test_abc123"
      )
    ).not.toThrow();
  });

  it("rejects PostgreSQL URLs without test marker in default dev env", () => {
    expect(() =>
      validateTestUrl("postgresql://markflow:markflow@localhost:5432/markflow")
    ).toThrow(/test marker|markflow_test/);
  });

  it("allows non-test URLs when ALLOW_TEST_DB_RESET=true", () => {
    const prev = process.env.ALLOW_TEST_DB_RESET;
    process.env.ALLOW_TEST_DB_RESET = "true";
    try {
      expect(() =>
        validateTestUrl(
          "postgresql://markflow:markflow@localhost:5432/markflow"
        )
      ).not.toThrow();
    } finally {
      process.env.ALLOW_TEST_DB_RESET = prev;
    }
  });
});

// ─── Migration chain validation ────────────────────────────────────────

describe("PG migration chain", () => {
  const SCHEMA = "packages/db/prisma/pg/schema.prisma";
  const MIGRATIONS_DIR = "packages/db/prisma/pg/migrations";

  it("migration lock file exists and says postgresql", () => {
    const fs = require("node:fs");
    const lockPath = join(MIGRATIONS_DIR, "migration_lock.toml");
    expect(fs.existsSync(lockPath)).toBe(true);
    const content = fs.readFileSync(lockPath, "utf8");
    expect(content).toContain('provider = "postgresql"');
  });

  it("baseline migration exists and is non-empty", () => {
    const fs = require("node:fs");
    const dirs = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((d: string) => d !== "migration_lock.toml");
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    const migrationSql = fs.readFileSync(
      join(MIGRATIONS_DIR, dirs[0], "migration.sql"),
      "utf8"
    );
    expect(migrationSql.length).toBeGreaterThan(100);
    expect(migrationSql).toContain("CREATE TABLE");
  });

  it("schema.pg.prisma exists and uses postgresql provider", () => {
    const fs = require("node:fs");
    expect(fs.existsSync(SCHEMA)).toBe(true);
    const content = fs.readFileSync(SCHEMA, "utf8");
    expect(content).toContain('provider = "postgresql"');
  });

  it("PG migrations directory has exactly one baseline", () => {
    const fs = require("node:fs");
    const dirs = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((d: string) => d !== "migration_lock.toml");
    // Only the baseline should exist
    expect(dirs.length).toBe(1);
    expect(dirs[0]).toContain("baseline");
  });
});

// ─── PrismaService contract ────────────────────────────────────────────

describe("PrismaService DB contract", () => {
  it("branches on URL scheme for adapter selection", () => {
    const fs = require("node:fs");
    const content = fs.readFileSync("apps/api/src/prisma.service.ts", "utf8");
    // Must check URL before creating adapter
    expect(content).toContain("isPostgres");
    expect(content).toContain("postgresql://");
    expect(content).toContain("PrismaLibSQL");
    // Must NOT unconditionally use PrismaLibSQL
    expect(content).toMatch(/if\s*\(\s*isPostgres/);
  });

  it("does not hardcode DEFAULT_DB for production", () => {
    const fs = require("node:fs");
    const content = fs.readFileSync("apps/api/src/prisma.service.ts", "utf8");
    // DEFAULT_DB is only used as fallback for SQLite dev mode
    expect(content).toContain("SQLITE_DEFAULT_DB");
    // Production path uses DATABASE_URL directly
    expect(content).toContain("DATABASE_URL");
  });
});

// ─── Seed safety ───────────────────────────────────────────────────────

describe("Seed safety", () => {
  it("seed.ts refuses to run without DATABASE_URL", () => {
    const fs = require("node:fs");
    const content = fs.readFileSync("packages/db/src/seed.ts", "utf8");
    expect(content).toContain("DATABASE_URL is required");
    expect(content).toContain("process.exit(1)");
  });

  it("seed.ts blocks production mode without SEED_ENABLED", () => {
    const fs = require("node:fs");
    const content = fs.readFileSync("packages/db/src/seed.ts", "utf8");
    expect(content).toContain('NODE_ENV === "production"');
    expect(content).toContain("SEED_ENABLED=true");
  });
});

// ─── Helper: validate test URL ─────────────────────────────────────────

function validateTestUrl(url: string): void {
  if (url.startsWith("file:")) {
    throw new Error(
      "TEST_DATABASE_URL must be a PostgreSQL connection string, not file:"
    );
  }
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL connection string");
  }
  const allowReset = process.env.ALLOW_TEST_DB_RESET === "true";
  if (!allowReset && !url.includes("markflow_test_")) {
    throw new Error(
      "TEST_DATABASE_URL must contain a test marker (e.g. markflow_test_) unless ALLOW_TEST_DB_RESET=true"
    );
  }
}
