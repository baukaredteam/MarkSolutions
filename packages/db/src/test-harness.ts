import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// W0-02R-final2: shared test database harness for packages/db specs.
// Mirrors apps/api/test/harness.ts. All specs run against a disposable
// PostgreSQL 16 database (isolated schema under TEST_DATABASE_URL).
// Uses the shared URL validator (scripts/db-url-validator.mjs) via dynamic import.

const MIGRATION_SCHEMA = "packages/db/prisma/schema.prisma";

export interface TestDb {
  schema: string;
  databaseUrl: string;
  baseUrl: string;
  cleanup: () => Promise<void>;
}

export async function requireTestDatabaseUrl(): Promise<string> {
  const { validateTestDatabaseUrl } =
    await import("../../../scripts/db-url-validator.mjs");
  return validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
}

function withSchema(baseUrl: string, schema: string): string {
  const u = new URL(baseUrl);
  u.searchParams.set("schema", schema);
  return u.toString();
}

async function dropSchema(baseUrl: string, schema: string): Promise<void> {
  const a = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    await a.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await a.$disconnect();
  }
}

export async function createTestDatabase(): Promise<TestDb> {
  const baseUrl = await requireTestDatabaseUrl();
  const schema = `s_${randomBytes(10).toString("hex")}`;
  let schemaCreated = false;

  try {
    const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      schemaCreated = true;
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
      cleanup: () => dropSchema(baseUrl, schema),
    };
  } catch (e) {
    if (schemaCreated) {
      await dropSchema(baseUrl, schema).catch(() => {});
    }
    throw e;
  }
}

export async function teardownTestDatabase(testDb: TestDb): Promise<void> {
  await testDb.cleanup();
}
