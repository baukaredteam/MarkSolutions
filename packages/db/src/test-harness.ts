import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// W0-02R: shared test database harness for packages/db specs.
// Mirrors apps/api/test/harness.ts. All specs run against a disposable
// PostgreSQL 16 database (isolated schema under TEST_DATABASE_URL).

const MIGRATION_SCHEMA = "packages/db/prisma/schema.prisma";

export interface TestDb {
  schema: string;
  databaseUrl: string;
  baseUrl: string;
  cleanup: () => Promise<void>;
}

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
  const allowReset = process.env.ALLOW_TEST_DB_RESET === "true";
  if (!allowReset && !url.includes("markflow_test")) {
    throw new Error(
      "TEST_DATABASE_URL must contain the test marker 'markflow_test' " +
        "(e.g. .../markflow_test) unless ALLOW_TEST_DB_RESET=true"
    );
  }
  return url;
}

function withSchema(baseUrl: string, schema: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("schema", schema);
  return u.toString();
}

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

export async function teardownTestDatabase(testDb: TestDb): Promise<void> {
  await testDb.cleanup();
}
