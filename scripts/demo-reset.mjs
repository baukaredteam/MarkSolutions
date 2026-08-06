#!/usr/bin/env node
// demo-reset.mjs — свежая dev.db + seed (демо из известного состояния).
// Удаляет packages/db/prisma/dev.db, применяет миграции, запускает seed.
import { execSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const dbPath = join(root, "packages", "db", "prisma", "dev.db");

if (existsSync(dbPath)) {
  rmSync(dbPath, { force: true });
  console.log(`removed ${dbPath}`);
}
// также убираем WAL/SHM
for (const suffix of ["-wal", "-shm", "-journal"]) {
  const p = dbPath + suffix;
  if (existsSync(p)) rmSync(p, { force: true });
}

const url = `file:${dbPath}`; // Windows: backslashes, как в тестах (onboarding.spec.ts)
execSync("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma", {
  cwd: root,
  env: { ...process.env, DATABASE_URL: url },
  stdio: "inherit",
});
execSync("npx tsx packages/db/src/seed.ts", {
  cwd: root,
  env: { ...process.env, DATABASE_URL: url },
  stdio: "inherit",
});
console.log("demo:reset OK — свежая dev.db с seeded-данными");
