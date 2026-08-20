// W0-02R: self-contained PG migration validation.
// Requires an explicit, safe TEST_DATABASE_URL (never ambient DATABASE_URL).
// Creates an isolated schema, applies the committed baseline via `migrate deploy`,
// verifies `migrate status` is clean, runs a capability assertion (create/read a
// Tenant), then drops ONLY the isolated schema.
//
// Usage: TEST_DATABASE_URL=postgresql://.../markflow_test node scripts/db-validate.mjs

import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

function requireTestDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.error(
      "db:validate FAILED: TEST_DATABASE_URL is required (a PostgreSQL URL with the 'markflow_test' marker)."
    );
    process.exit(1);
  }
  if (url.startsWith("file:")) {
    console.error("db:validate FAILED: TEST_DATABASE_URL must be PostgreSQL, not file:");
    process.exit(1);
  }
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    console.error("db:validate FAILED: TEST_DATABASE_URL must be a PostgreSQL connection string");
    process.exit(1);
  }
  const allowReset = process.env.ALLOW_TEST_DB_RESET === "true";
  if (!allowReset && !url.includes("markflow_test")) {
    console.error("db:validate FAILED: TEST_DATABASE_URL must contain the 'markflow_test' marker");
    process.exit(1);
  }
  return url;
}

function withSchema(baseUrl, schema) {
  const u = new URL(baseUrl);
  u.searchParams.set("schema", schema);
  return u.toString();
}

async function main() {
  const baseUrl = requireTestDatabaseUrl();
  const schema = `s_${randomBytes(10).toString("hex")}`;

  const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await admin.$disconnect();
  }
  const databaseUrl = withSchema(baseUrl, schema);

  console.log(`db:validate: deploying baseline to isolated schema "${schema}"...`);
  execSync(`npx prisma migrate deploy --schema packages/db/prisma/schema.prisma`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  console.log(`db:validate: checking migrate status on "${schema}"...`);
  execSync(`npx prisma migrate status --schema packages/db/prisma/schema.prisma`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  console.log(`db:validate: capability assertion (write/read a Tenant) on "${schema}"...`);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const t = await prisma.tenant.create({
      data: { bin: "w02r_validate", name: "validate", status: "ACTIVE" },
    });
    const found = await prisma.tenant.findUnique({ where: { id: t.id } });
    if (!found) throw new Error("capability assertion failed: tenant not readable");
    console.log(`db:validate: capability OK (tenant ${t.id})`);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`db:validate: dropping isolated schema "${schema}"...`);
  const a = new PrismaClient({ datasources: { db: { url: baseUrl } } });
  try {
    await a.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await a.$disconnect();
  }

  console.log("db:validate: PASSED");
}

main().catch((e) => {
  console.error("db:validate FAILED:", e.message);
  process.exit(1);
});
