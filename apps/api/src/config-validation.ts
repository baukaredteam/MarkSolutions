/**
 * W0-01b — Production configuration validation, typed config source, and
 * secret scan patterns.
 *
 * Single source of truth: buildAppConfig(env) returns a validated AppConfig
 * object consumed by bootstrap AND DI. validateProductionConfig() is called
 * at process start (before NestFactory.create()). Stage mode now rejects
 * demo-only config identically to production.
 *
 * sanitizeHealthError() strips connection strings and host:port from error
 * messages before they appear in health endpoints.
 */

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export type EnvMode = "production" | "stage" | "test" | "development" | string;

export interface AppConfig {
  mode: EnvMode;
  isProduction: boolean;
  db: { url: string };
  jwt: { secret: string; expiresIn: string };
  kms: {
    profile: string; // "file" | "openbao"
    fileDir: string;
    openbaoAddr: string;
    openbaoToken: string;
    openbaoMount: string; // e.g. "transit"
    openbaoKey: string; // e.g. "markflow-local"
    openbaoTimeoutMs: number;
  };
  storage: {
    local: boolean;
    dir: string;
    profile: string; // "local" | "minio"
    minioEndpoint: string;
    minioAccessKey: string;
    minioSecretKey: string;
    minioBucket: string;
    minioUseSsl: boolean;
    minioTimeoutMs: number;
    minioTenantPrefix: string;
  };
  adapters: { mpt: string; gs1: string; nkt: string; ecom: string };
  mpt: {
    baseUrl: string;
    login: string;
    password: string;
    requestTimeoutMs: number;
    maxRetries: number;
    productGroup: string;
    businessPlaceId: string | null;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Error type
// ═══════════════════════════════════════════════════════════════════════

export class ConfigValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Configuration validation failed:\n  - ${errors.join("\n  - ")}`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Secret scan patterns (shared between scanner and tests)
// ═══════════════════════════════════════════════════════════════════════

export const SECRET_SCAN_PATTERNS: Array<[RegExp, string]> = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/ghp_[A-Za-z0-9]{36}/, "GitHub PAT"],
  [/sk-[A-Za-z0-9]{20,}/, "OpenAI key"],
  [/postgresql:\/\/[^:]+:[^@]+@/, "hardcoded DB creds"],
  // W0-01b: generic credential-like literals in non-test files
  [/_PASSWORD\s*=\s*"[^"]{8,}"/, "likely hardcoded password"],
  [/_SECRET_KEY\s*=\s*"[^"]{8,}"/, "likely hardcoded secret key"],
  [/Bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT token literal"],
];

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function blank(v: string | undefined): boolean {
  return v === undefined || v.trim() === "";
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ═══════════════════════════════════════════════════════════════════════
// Validation (production AND stage reject; test/dev allow everything)
// ═══════════════════════════════════════════════════════════════════════

function buildConfigChecks(env: Record<string, string>): string[] {
  const errors: string[] = [];

  // JWT
  const jwt = env.JWT_SECRET;
  if (jwt === "dev-secret") {
    errors.push(
      'JWT_SECRET is "dev-secret" — requires a unique secret of ≥ 20 characters'
    );
  } else if (blank(jwt) || (jwt?.length ?? 0) < 20) {
    errors.push("JWT_SECRET must be at least 20 characters");
  }

  // Mock adapters (AGENTS.md §4: no mock-адаптеры in production/stage)
  for (const name of ["MPT", "GS1", "NKT", "1ECOM"] as const) {
    const val = env[`ADAPTERS_${name}`];
    if (blank(val) || val === "mock") {
      errors.push(
        `ADAPTERS_${name}="${val ?? "(unset)"}" — http adapter required`
      );
    }
  }

  // KMS
  const kms = env.KMS_PROFILE;
  if (blank(kms) || kms === "file") {
    errors.push(`KMS_PROFILE="${kms ?? "(unset)"}" — openbao required`);
  }

  // Storage
  if (!blank(env.STORAGE_DIR)) {
    errors.push(
      "STORAGE_DIR is set — use object storage, not local filesystem"
    );
  }

  // Database
  const dbUrl = env.DATABASE_URL;
  if (blank(dbUrl)) {
    errors.push("DATABASE_URL is required");
  } else if (
    !dbUrl.startsWith("postgresql://") &&
    !dbUrl.startsWith("postgres://")
  ) {
    errors.push("DATABASE_URL must be a PostgreSQL connection string");
  }

  // MPT
  if (blank(env.MPT_BASE_URL)) errors.push("MPT_BASE_URL is required");
  if (blank(env.MPT_LOGIN)) errors.push("MPT_LOGIN is required");
  if (blank(env.MPT_PASSWORD)) errors.push("MPT_PASSWORD is required");

  // MinIO
  if (blank(env.MINIO_ENDPOINT)) errors.push("MINIO_ENDPOINT is required");

  return errors;
}

/**
 * Validate the current environment configuration.
 * production AND stage reject demo-only config (fail closed).
 * test/dev/unset allow anything.
 */
export function validateProductionConfig(
  env: Record<string, string> = process.env as Record<string, string>
): void {
  const mode: EnvMode = env.NODE_ENV ?? "";

  // test/dev/unset — full allowance
  if (mode === "test" || mode === "development" || mode === "") return;

  // production AND stage — reject demo-only config
  const errors = buildConfigChecks(env);
  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Typed config source (single source of truth for bootstrap AND DI)
// ═══════════════════════════════════════════════════════════════════════

export function buildAppConfig(
  env: Record<string, string> = process.env as Record<string, string>
): AppConfig {
  // Validates first — throws ConfigValidationError on failure
  validateProductionConfig(env);

  const mode: EnvMode = env.NODE_ENV ?? "";

  return {
    mode,
    isProduction: mode === "production",
    db: { url: env.DATABASE_URL ?? "" },
    jwt: {
      secret: env.JWT_SECRET ?? "",
      expiresIn: env.JWT_EXPIRES_IN ?? "1h",
    },
    kms: {
      profile: env.KMS_PROFILE ?? "file",
      fileDir: env.KMS_FILE_DIR ?? "",
      openbaoAddr: env.KMS_OPENBAO_ADDR ?? "",
      openbaoToken: env.KMS_OPENBAO_TOKEN ?? "",
      openbaoMount: env.KMS_OPENBAO_MOUNT ?? "transit",
      openbaoKey: env.KMS_OPENBAO_KEY ?? "markflow-local",
      openbaoTimeoutMs: num(env.KMS_OPENBAO_TIMEOUT_MS, 15000),
    },
    storage: {
      local: !blank(env.STORAGE_DIR),
      dir: env.STORAGE_DIR ?? "",
      profile: !blank(env.STORAGE_DIR) ? "local" : "minio",
      minioEndpoint: env.MINIO_ENDPOINT ?? "",
      minioAccessKey: env.MINIO_ACCESS_KEY ?? "",
      minioSecretKey: env.MINIO_SECRET_KEY ?? "",
      minioBucket: env.MINIO_BUCKET ?? "",
      minioUseSsl: env.MINIO_USE_SSL === "true",
      minioTimeoutMs: num(env.MINIO_TIMEOUT_MS, 30000),
      minioTenantPrefix: env.MINIO_TENANT_PREFIX ?? "markflow-local",
    },
    adapters: {
      mpt: env.ADAPTERS_MPT ?? "mock",
      gs1: env.ADAPTERS_GS1 ?? "mock",
      nkt: env.ADAPTERS_NKT ?? "mock",
      ecom: env.ADAPTERS_1ECOM ?? "mock",
    },
    mpt: {
      baseUrl: env.MPT_BASE_URL ?? "",
      login: env.MPT_LOGIN ?? "",
      password: env.MPT_PASSWORD ?? "",
      requestTimeoutMs: num(env.MPT_REQUEST_TIMEOUT_MS, 15000),
      maxRetries: num(env.MPT_MAX_RETRIES, 2),
      productGroup: env.MPT_PRODUCT_GROUP ?? "motor-oils",
      businessPlaceId: env.MPT_BUSINESS_PLACE_ID ?? null,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Health endpoint sanitization
// ═══════════════════════════════════════════════════════════════════════

/** Remove connection strings, host:port, and credentials from error messages.
 *  Keep error class names and general descriptors for debugging. */
export function sanitizeHealthError(msg: string): string {
  if (!msg) return "";
  return msg
    .replace(/postgresql?:\/\/[^\s"']*/gi, "[REDACTED]")
    .replace(/postgres:\/\/[^\s"']*/gi, "[REDACTED]")
    .replace(/:\d{2,5}(?:\/|$|\s)/g, ":[PORT]")
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, "[HOST]")
    .replace(/user:[^\s@]+@/gi, "user:[REDACTED]@")
    .slice(0, 200);
}
