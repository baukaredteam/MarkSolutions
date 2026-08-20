// W0-02R: single source of truth for TEST_DATABASE_URL validation.
// Parse URL; validate protocol; exact-match database name against approved
// test DB policy; reject stage/production regardless of URL; no override flag.
//
// Usage: node scripts/db-url-validator.mjs
//   exits 0 and prints the validated URL on success
//   exits 1 with error message on failure

import { URL } from "node:url";

const APPROVED_DATABASES = ["markflow_test"];
const BLOCKED_MODES = ["production", "stage"];

export function validateTestDatabaseUrl(url, env = process.env) {
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is required. Set it to a PostgreSQL URL with an approved test database name."
    );
  }

  // Reject stage/production regardless of URL
  const mode = (env.NODE_ENV ?? env.APP_ENV ?? "").toLowerCase();
  if (BLOCKED_MODES.includes(mode)) {
    throw new Error(
      `TEST_DATABASE_URL must not be used in ${mode} mode. Tests use disposable schemas; stage/production must use migrate deploy only.`
    );
  }

  // Reject file: protocol
  if (url.startsWith("file:")) {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL connection string, not file:");
  }

  // Parse URL — validates structure
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }

  // Validate protocol
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      `TEST_DATABASE_URL must use postgresql:// or postgres:// protocol, got ${parsed.protocol}`
    );
  }

  // Extract and decode database name from pathname (leading / is stripped by URL)
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));

  // Exact-match database name against approved list
  if (!APPROVED_DATABASES.includes(dbName)) {
    throw new Error(
      `TEST_DATABASE_URL database name must be exactly one of: ${APPROVED_DATABASES.join(", ")}. Got: "${dbName}"`
    );
  }

  // Reject query params that could redirect to a different schema via the URL itself
  // (the harness adds ?schema= internally; the user must not set it)
  if (parsed.searchParams.has("schema")) {
    throw new Error(
      "TEST_DATABASE_URL must not contain a ?schema= parameter. The test harness sets it automatically."
    );
  }

  return url;
}

// CLI mode: validate and print
if (process.argv[1] && process.argv[1].endsWith("db-url-validator.mjs")) {
  try {
    const validated = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
    console.log(validated);
    process.exit(0);
  } catch (e) {
    console.error(`VALIDATION FAILED: ${e.message}`);
    process.exit(1);
  }
}
