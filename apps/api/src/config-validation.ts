/**
 * W0-01 — Startup configuration validation for production environments.
 *
 * Fails fast if the process is booted in production mode with demo-only
 * infrastructure (mock adapters, file KMS, local storage, weak JWT secret,
 * missing required variables).
 *
 * Non-production modes (test, development, stage, unset) are allowed to use
 * mock adapters and dev defaults. Stage logs warnings but does not abort.
 *
 * Run once at process start, before NestFactory.create(), so that no
 * production request can be served with insecure configuration.
 */

export type EnvMode = "production" | "stage" | "test" | "development" | string;

export class ConfigValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Configuration validation failed:\n  - ${errors.join("\n  - ")}`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

/** Detect whether a value is blank (undefined, empty string, or whitespace-only). */
function blank(v: string | undefined): boolean {
  return v === undefined || v.trim() === "";
}

/** Build a production-mode validator that collects ALL errors before throwing. */
function buildProductionChecks(
  env: Record<string, string>
): Array<string | null> {
  const checks: Array<string | null> = [];

  // --- JWT Secret ---
  const jwtSecret = env.JWT_SECRET;
  if (jwtSecret === "dev-secret") {
    checks.push(
      'JWT_SECRET is "dev-secret" — production requires a unique secret of ≥ 20 characters'
    );
  } else if (blank(jwtSecret) || (jwtSecret?.length ?? 0) < 20) {
    checks.push("JWT_SECRET must be at least 20 characters in production");
  }

  // --- Mock adapters (AGENTS.md §4: no mock-адаптеры in production) ---
  for (const name of ["MPT", "GS1", "NKT", "1ECOM"] as const) {
    const val = env[`ADAPTERS_${name}`];
    if (blank(val) || val === "mock") {
      checks.push(
        `ADAPTERS_${name} is "${val ?? "(unset)"}" — production requires http adapter`
      );
    }
  }

  // --- KMS (no file KMS in production) ---
  const kmsProfile = env.KMS_PROFILE;
  if (blank(kmsProfile) || kmsProfile === "file") {
    checks.push(
      `KMS_PROFILE is "${kmsProfile ?? "(unset)"}" — production requires openbao`
    );
  }

  // --- Storage (no local filesystem) ---
  const storageDir = env.STORAGE_DIR;
  if (!blank(storageDir)) {
    checks.push(
      "STORAGE_DIR is set — production must use object storage (MinIO/S3), not local filesystem"
    );
  }

  // --- Database (PostgreSQL only) ---
  const dbUrl = env.DATABASE_URL;
  if (blank(dbUrl)) {
    checks.push("DATABASE_URL is required in production");
  } else if (
    !dbUrl.startsWith("postgresql://") &&
    !dbUrl.startsWith("postgres://")
  ) {
    checks.push(
      `DATABASE_URL must be a PostgreSQL connection string (got "${dbUrl.slice(0, 40)}...")`
    );
  }

  // --- MPT credentials ---
  if (blank(env.MPT_BASE_URL)) {
    checks.push("MPT_BASE_URL is required in production");
  }
  if (blank(env.MPT_LOGIN)) {
    checks.push("MPT_LOGIN is required in production");
  }
  if (blank(env.MPT_PASSWORD)) {
    checks.push("MPT_PASSWORD is required in production");
  }

  // --- MinIO ---
  if (blank(env.MINIO_ENDPOINT)) {
    checks.push("MINIO_ENDPOINT is required in production");
  }

  return checks;
}

/**
 * Validate the current environment configuration.
 *
 * - production: rejects demo-only config, missing secrets, mock adapters
 * - stage: logs warnings (no abort)
 * - test/development/unset: allows anything (demo defaults)
 *
 * @throws {ConfigValidationError} if production config is invalid
 */
export function validateProductionConfig(
  env: Record<string, string> = process.env as Record<string, string>
): void {
  const mode: EnvMode = env.NODE_ENV ?? "";

  if (mode !== "production") {
    // Stage: warn but allow. Test/dev/unset: full allowance.
    if (mode === "stage") {
      const warnings = buildProductionChecks(env).filter(Boolean);
      if (warnings.length > 0) {
        console.warn(
          `[config-validation] Stage mode — ${warnings.length} production warnings:\n  - ${warnings.join("\n  - ")}`
        );
      }
    }
    return;
  }

  const errors = buildProductionChecks(env).filter(Boolean) as string[];
  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }
}
