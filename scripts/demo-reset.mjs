#!/usr/bin/env node
// W0-02R: fresh dev database + seed against PostgreSQL.
// Replaces the old SQLite dev.db reset. Point DATABASE_URL at a PostgreSQL
// database you control (local or containerised PG 16).
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url || !url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
  console.error(
    "demo:reset FAILED: set DATABASE_URL to a PostgreSQL connection string, e.g.\n" +
      "  DATABASE_URL=postgresql://markflow:markflow@localhost:5432/markflow_dev npm run demo:reset"
  );
  process.exit(1);
}

console.log(`demo:reset: applying migrations to ${url.replace(/\/\/.*@/, "//***@")}`);
execSync("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma", {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: url },
  stdio: "inherit",
});
execSync("npx tsx packages/db/src/seed.ts", {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: url },
  stdio: "inherit",
});
console.log("demo:reset OK — fresh PostgreSQL database with seeded demo data");
