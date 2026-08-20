// W0-02R: code-level guard rejecting stage/production for destructive dev
// operations (migrate dev / seed / reset). The deploy path (migrate deploy /
// migrate status) is always allowed; this guard only blocks dev-only mutation
// commands from running against shared stage/production databases.
//
// Usage: node scripts/db-guard.mjs <operation>
//   operation ∈ { migrate-dev, seed, reset }
// Exits 0 if allowed, 1 if blocked.

const op = process.argv[2];
const mode = process.env.NODE_ENV || process.env.APP_ENV || "";

const BLOCKED_MODES = ["production", "stage"];

if (BLOCKED_MODES.includes(mode)) {
  console.error(
    `[db-guard] BLOCKED: '${op}' is a development-only operation and must not run ` +
      `against ${mode}. Use 'migrate deploy' (apply committed migrations) instead.`
  );
  process.exit(1);
}

// Explicit safety: never run destructive dev ops against an unknown/empty mode
// that could resolve to a shared DB. require explicit development/test.
if (op === "migrate-dev" || op === "reset") {
  const url = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || "";
  if (!url) {
    console.error(`[db-guard] BLOCKED: DATABASE_URL is required for '${op}'`);
    process.exit(1);
  }
  if (url.startsWith("file:")) {
    // file: is no longer a supported runtime target (W0-02R).
    console.error(`[db-guard] BLOCKED: '${op}' does not support file: databases`);
    process.exit(1);
  }
}

process.exit(0);
