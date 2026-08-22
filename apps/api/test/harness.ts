import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// W0-02R-final2: shared test database harness.
// All integration/API tests run against a disposable PostgreSQL 16 database.
// Uses the shared URL validator (scripts/db-url-validator.mjs) via dynamic import.
// This is the ONLY validation path — no inline copies.

const MIGRATION_SCHEMA = "packages/db/prisma/schema.prisma";

export interface TestDb {
  schema: string;
  databaseUrl: string;
  baseUrl: string;
  cleanup: () => Promise<void>;
}

/**
 * Validate TEST_DATABASE_URL by importing the shared validator.
 * Uses dynamic import() to load the .mjs module in both TS and JS contexts.
 */
export async function requireTestDatabaseUrl(): Promise<string> {
  const { validateTestDatabaseUrl } =
    await import("../../../scripts/db-url-validator.mjs");
  return validateTestDatabaseUrl(process.env.TEST_DATABASE_URL, process.env);
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
    await installSeedScopeTrigger(databaseUrl);

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

// W0-03a pt2: test-only seeding of the legal-entity scope graph. Production
// code has NO fallback — this runs exclusively on disposable schemas and
// mirrors real provisioning: every tenant gets LegalEntity `le-<tenantId>`,
// admin user `u1` and a membership so crafted JWTs carry a validated scope.
const SEED_SCOPE_STATEMENTS = [
  `CREATE OR REPLACE FUNCTION mf_seed_scope() RETURNS trigger AS $$
BEGIN
  INSERT INTO "User" ("id","version","login","passwordHash","roles","mfaEnabled","tenantId")
  VALUES ('u1',0,'seed-u1','x','["admin","manager","accountant","marking","warehouse","viewer"]',false,NEW."id")
  ON CONFLICT ("id") DO NOTHING;
  INSERT INTO "LegalEntity" ("id","version","tenantId","bin","name","status","createdAt","updatedAt")
  VALUES ('le-'||NEW."id",0,NEW."id",NEW."bin"||'-le','Legal Entity','ACTIVE',NOW(),NOW())
  ON CONFLICT DO NOTHING;
  INSERT INTO "UserLegalEntityMembership" ("id","userId","legalEntityId","scope")
  VALUES ('m-'||NEW."id",'u1','le-'||NEW."id",'member')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$ LANGUAGE plpgsql;`,
  `DROP TRIGGER IF EXISTS trg_mf_seed_scope ON "Tenant";`,
  `CREATE TRIGGER trg_mf_seed_scope AFTER INSERT ON "Tenant"
FOR EACH ROW EXECUTE FUNCTION mf_seed_scope();`,
];

async function installSeedScopeTrigger(databaseUrl: string): Promise<void> {
  const a = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    // Prisma raw queries allow exactly ONE statement per call (42601 otherwise).
    for (const stmt of SEED_SCOPE_STATEMENTS) {
      await a.$executeRawUnsafe(stmt);
    }
  } finally {
    await a.$disconnect();
  }
}
