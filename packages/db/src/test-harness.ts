import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// W0-02R: shared test database harness for packages/db specs.
// Mirrors apps/api/test/harness.ts. All specs run against a disposable
// PostgreSQL 16 database (isolated schema under TEST_DATABASE_URL).
// Uses the same validation logic as scripts/db-url-validator.mjs.

const MIGRATION_SCHEMA = "packages/db/prisma/schema.prisma";

const APPROVED_DATABASES = ["markflow_test"];
const BLOCKED_MODES = ["production", "stage"];

export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required. Set it to a PostgreSQL URL with an approved test database name."
    );
  }
  const mode = (
    process.env.NODE_ENV ??
    process.env.APP_ENV ??
    ""
  ).toLowerCase();
  if (BLOCKED_MODES.includes(mode)) {
    throw new Error(`TEST_DATABASE_URL must not be used in ${mode} mode.`);
  }
  if (url.startsWith("file:")) {
    throw new Error(
      "TEST_DATABASE_URL must be a PostgreSQL connection string, not file:"
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      `TEST_DATABASE_URL must use postgresql:// or postgres:// protocol, got ${parsed.protocol}`
    );
  }
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!APPROVED_DATABASES.includes(dbName)) {
    throw new Error(
      `TEST_DATABASE_URL database name must be exactly one of: ${APPROVED_DATABASES.join(", ")}. Got: "${dbName}"`
    );
  }
  if (parsed.searchParams.has("schema")) {
    throw new Error("TEST_DATABASE_URL must not contain a ?schema= parameter.");
  }
  return url;
}

export interface TestDb {
  schema: string;
  databaseUrl: string;
  baseUrl: string;
  cleanup: () => Promise<void>;
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
  const baseUrl = requireTestDatabaseUrl();
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
