import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// W0-02R: shared test database harness.
// All integration/API tests run against a disposable PostgreSQL 16 database.
// Uses the shared URL validator (scripts/db-url-validator.mjs) via execSync
// for validation, and inlines the same logic for runtime use.

const MIGRATION_SCHEMA = "packages/db/prisma/schema.prisma";

/** Approved test database names (exact match, not substring). */
const APPROVED_DATABASES = ["markflow_test"];
const BLOCKED_MODES = ["production", "stage"];

/**
 * Validate TEST_DATABASE_URL: parse URL, validate protocol, exact-match
 * database name, reject stage/production, reject ?schema= override.
 * This is the single source of truth for harness validation.
 */
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
    throw new Error(
      `TEST_DATABASE_URL must not be used in ${mode} mode. Tests use disposable schemas; stage/production must use migrate deploy only.`
    );
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
    throw new Error(
      "TEST_DATABASE_URL must not contain a ?schema= parameter. The test harness sets it automatically."
    );
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

/** Create an isolated schema under TEST_DATABASE_URL, migrate it, return handles.
 *  finally-safe: if anything fails after schema creation, the schema is dropped. */
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
