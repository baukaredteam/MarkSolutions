// W0-02R: start a disposable PostgreSQL 16 for local test runs.
// Uses embedded-postgres (real PostgreSQL binary) — no Docker required.
// Creates the `markflow_test` base database that the test harness uses to
// spawn isolated schemas. Keeps running until killed (Ctrl-C / process exit).

import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.TEST_PG_PORT ?? 5432);
const USER = process.env.TEST_PG_USER ?? "markflow";
const PASS = process.env.TEST_PG_PASSWORD ?? "markflow";
const BASE_DB = process.env.TEST_PG_BASE_DB ?? "markflow_test";

const pg = new EmbeddedPostgres({
  user: USER,
  password: PASS,
  port: PORT,
  databaseDir: ".pgdata",
  persistent: false,
});

async function main() {
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(BASE_DB);
  } catch (e) {
    // already exists — fine
  }
  const url = `postgresql://${USER}:${PASS}@localhost:${PORT}/${BASE_DB}`;
  console.log(`TEST_PG_READY=${url}`);
  // keep the process alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

async function shutdown() {
  try {
    await pg.stop();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
