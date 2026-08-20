import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// W0-02R: shared test database harness.
// All integration/API tests run against a disposable PostgreSQL 16 database.
// The harness owns lifecycle: create an isolated schema, migrate it, expose a
// connection URL, and drop ONLY that isolated resource on cleanup.

const MIGRATION_SCHEMA = "packages/db/prisma/schema.prisma";

export interface TestDb {
  /** Isolated schema name (e.g. s_ab12cd34...). */
  schema: string;
  /** Connection URL scoped to the isolated schema (DATABASE_URL?schema=...). */
  databaseUrl: string;
  /** Base connection URL (without schema) used for admin ops. */
  baseUrl: string;
  /** Drop ONLY the isolated schema. Guarded by the test marker policy. */
  cleanup: () => Promise<void>;
}

/** Validate and return the required TEST_DATABASE_URL. Never falls back to ambient DATABASE_URL. */
export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required for integration tests. " +
        "Point it at a PostgreSQL 16 database whose name contains the 'markflow_test' marker, " +
        "e.g. postgresql://user:pass@localhost:5432/markflow_test"
    );
  }
  if (url.startsWith("file:")) {
    throw new Error(
      "TEST_DATABASE_URL must be a PostgreSQL connection string, not file:"
    );
  }
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new Error(
      "TEST_DATABASE_URL must be a PostgreSQL (postgresql://) connection string"
    );
  }
  if (!url.includes("markflow_test")) {
    throw new Error(
      "TEST_DATABASE_URL must contain the test marker 'markflow_test' " +
        "(e.g. .../markflow_test)"
    );
  }
  return url;
}

function withSchema(baseUrl: string, schema: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("schema", schema);
  return u.toString();
}

/** Create an isolated schema under TEST_DATABASE_URL, migrate it, return handles. */
export async function createTestDatabase(): Promise<TestDb> {
  const baseUrl = requireTestDatabaseUrl();
  const schema = `s_${randomBytes(10).toString("hex")}`;

  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await admin.$disconnect();
  }

  const databaseUrl = withSchema(baseUrl, schema);
  execSync(`npx prisma migrate deploy --schema ${MIGRATION_SCHEMA}`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });

  return {
    schema,
    databaseUrl,
    baseUrl,
    cleanup: async () => {
      const a = new PrismaClient({ datasources: { db: { url: baseUrl } } });
      try {
        await a.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await a.$disconnect();
      }
    },
  };
}

/** Drop the isolated schema created by createTestDatabase. */
export async function teardownTestDatabase(testDb: TestDb): Promise<void> {
  await testDb.cleanup();
}
