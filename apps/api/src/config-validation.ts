// W0-03a — single typed APP_CONFIG with strict profiles (ADR-026).
//
// Canonical profile source is APP_ENV ∈ {test,local,stage,production}.
// Missing/unknown APP_ENV is rejected. For one compatibility release only,
// NODE_ENV=development maps to "local" when APP_ENV is absent.
//
// Stage/production reject FileKMS, LocalStorage and mock adapters, and require
// complete MinIO/OpenBao fields. Local/test reject production identity fields
// when inappropriate (root token used as adapter token).
//
// buildAppConfig() returns the validated AppConfig consumed by bootstrap and
// every DI factory (JWT, MPT, KMS, storage, readiness). Those factories never
// read process.env / ConfigService for selection.

export const APP_CONFIG = "APP_CONFIG";

export type AppProfile = "test" | "local" | "stage" | "production";
export type AdapterMode = "mock" | "http";
export type KmsProfile = "file" | "openbao";
export type StorageBackend = "local" | "minio";

export interface OpenBaoConfig {
  addr: string;
  useTls: boolean;
  ca: string;
  mount: string;
  key: string;
  token: string;
  timeoutMs: number;
}

export interface MinioConfig {
  endpoint: string;
  useTls: boolean;
  ca: string;
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  timeoutMs: number;
}

export interface AppConfig {
  profile: AppProfile;
  isProduction: boolean; // stage OR production
  db: { url: string };
  jwt: { secret: string; expiresIn: string };
  kms: { profile: KmsProfile; fileDir: string; openbao: OpenBaoConfig };
  storage: { backend: StorageBackend; localDir: string; minio: MinioConfig };
  adapters: {
    mpt: AdapterMode;
    gs1: AdapterMode;
    nkt: AdapterMode;
    ecom: AdapterMode;
  };
  mpt: {
    baseUrl: string;
    login: string;
    password: string;
    requestTimeoutMs: number;
    maxRetries: number;
    productGroup: string;
    businessPlaceId: string | null;
    writeEnabled: boolean;
  };
}

export class ConfigValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Configuration validation failed:\n  - ${errors.join("\n  - ")}`);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

export const SECRET_SCAN_PATTERNS: Array<[RegExp, string]> = [
  [/AKIA[0-9A-Z]{16}/, "AWS access key"],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/ghp_[A-Za-z0-9]{36}/, "GitHub PAT"],
  [/sk-[A-Za-z0-9]{20,}/, "OpenAI key"],
  [/postgresql:\/\/[^:]+:[^@]+@/, "hardcoded DB creds"],
  [/_PASSWORD\s*=\s*"[^"]{8,}"/, "likely hardcoded password"],
  [/_SECRET_KEY\s*=\s*"[^"]{8,}"/, "likely hardcoded secret key"],
  [/Bearer\s+eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "JWT token literal"],
];

const PROFILES: readonly AppProfile[] = [
  "test",
  "local",
  "stage",
  "production",
];

function blank(v: string | undefined): boolean {
  return v === undefined || v.trim() === "";
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (blank(v)) return fallback;
  return v === "true" || v === "1";
}

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveProfile(env: Record<string, string>): AppProfile {
  const appEnv = env.APP_ENV;
  if (!blank(appEnv)) {
    if ((PROFILES as readonly string[]).includes(appEnv))
      return appEnv as AppProfile;
    throw new ConfigValidationError([
      `APP_ENV="${appEnv}" is not one of ${PROFILES.join("|")}`,
    ]);
  }
  if (env.NODE_ENV === "development") return "local";
  throw new ConfigValidationError([
    `APP_ENV is required (one of ${PROFILES.join("|")})`,
  ]);
}

function adapterMode(
  errors: string[],
  env: Record<string, string>,
  name: string
): AdapterMode {
  const v = env[`ADAPTERS_${name}`];
  if (blank(v)) return "mock";
  if (v === "mock" || v === "http") return v;
  errors.push(`ADAPTERS_${name}="${v}" must be mock|http`);
  return "mock";
}

function validateOpenbao(
  errors: string[],
  env: Record<string, string>,
  o: OpenBaoConfig
): void {
  if (blank(o.addr)) errors.push("KMS_OPENBAO_ADDR is required");
  if (blank(o.mount)) errors.push("KMS_OPENBAO_MOUNT is required");
  if (blank(o.key)) errors.push("KMS_OPENBAO_KEY is required");
  if (blank(o.token)) errors.push("KMS_OPENBAO_TOKEN is required");
  if (o.useTls && blank(o.ca))
    errors.push("KMS_OPENBAO_CA is required when TLS enabled");
}

function validateMinio(
  errors: string[],
  env: Record<string, string>,
  m: MinioConfig
): void {
  if (blank(m.endpoint)) errors.push("MINIO_ENDPOINT is required");
  if (blank(m.bucket)) errors.push("MINIO_BUCKET is required");
  if (blank(m.region)) errors.push("MINIO_REGION is required");
  if (blank(m.accessKey)) errors.push("MINIO_ACCESS_KEY is required");
  if (blank(m.secretKey)) errors.push("MINIO_SECRET_KEY is required");
  if (m.useTls && blank(m.ca))
    errors.push("MINIO_CA is required when TLS enabled");
}

export function buildAppConfig(
  env: Record<string, string> = process.env as Record<string, string>
): AppConfig {
  const profile = resolveProfile(env);
  const isProduction = profile === "stage" || profile === "production";
  const errors: string[] = [];

  // JWT
  const jwtSecret = env.JWT_SECRET ?? "";
  if (isProduction) {
    if (jwtSecret === "dev-secret") {
      errors.push(
        'JWT_SECRET is "dev-secret" — requires a unique secret of ≥ 20 characters'
      );
    } else if (jwtSecret.length < 20) {
      errors.push("JWT_SECRET must be at least 20 characters");
    }
  }

  // Adapters
  const mptMode = adapterMode(errors, env, "MPT");
  const gs1Mode = adapterMode(errors, env, "GS1");
  const nktMode = adapterMode(errors, env, "NKT");
  const ecomMode = adapterMode(errors, env, "1ECOM");
  if (isProduction) {
    for (const [name, mode] of [
      ["MPT", mptMode],
      ["GS1", gs1Mode],
      ["NKT", nktMode],
      ["1ECOM", ecomMode],
    ] as const) {
      if (mode !== "http")
        errors.push(`ADAPTERS_${name}="${mode}" — http adapter required`);
    }
  }

  // KMS
  const kmsProfileRaw = env.KMS_PROFILE ?? "file";
  const kmsProfile: KmsProfile =
    kmsProfileRaw === "openbao" ? "openbao" : "file";
  const openbao: OpenBaoConfig = {
    addr: env.KMS_OPENBAO_ADDR ?? "",
    useTls: bool(env.KMS_OPENBAO_USE_TLS, false),
    ca: env.KMS_OPENBAO_CA ?? "",
    mount: env.KMS_OPENBAO_MOUNT ?? "transit",
    key: env.KMS_OPENBAO_KEY ?? "markflow-local",
    token: env.KMS_OPENBAO_TOKEN ?? "",
    timeoutMs: num(env.KMS_OPENBAO_TIMEOUT_MS, 15000),
  };
  if (isProduction) {
    if (kmsProfile !== "openbao")
      errors.push(`KMS_PROFILE="${kmsProfileRaw}" — openbao required`);
    validateOpenbao(errors, env, openbao);
  } else {
    // local/test: reject production identity fields when inappropriate —
    // the restricted adapter token must not be the root token.
    if (kmsProfile === "openbao") validateOpenbao(errors, env, openbao);
    const rootToken = env.LOCAL_OPENBAO_ROOT_TOKEN;
    if (
      !blank(rootToken) &&
      !blank(openbao.token) &&
      openbao.token === rootToken
    ) {
      errors.push(
        "KMS_OPENBAO_TOKEN must not be the OpenBao root token (use the restricted adapter token)"
      );
    }
  }

  // Storage
  const localDir = env.STORAGE_DIR ?? "";
  const minio: MinioConfig = {
    endpoint: env.MINIO_ENDPOINT ?? "",
    useTls: bool(env.MINIO_USE_SSL, false),
    ca: env.MINIO_CA ?? "",
    bucket: env.MINIO_BUCKET ?? "",
    region: env.MINIO_REGION ?? "us-east-1",
    accessKey: env.MINIO_ACCESS_KEY ?? "",
    secretKey: env.MINIO_SECRET_KEY ?? "",
    timeoutMs: num(env.MINIO_TIMEOUT_MS, 30000),
  };
  let backend: StorageBackend = "local";
  if (isProduction) {
    backend = "minio";
    if (!blank(localDir))
      errors.push(
        "STORAGE_DIR is set — use object storage, not local filesystem"
      );
    validateMinio(errors, env, minio);
  } else {
    backend = !blank(minio.endpoint) ? "minio" : "local";
    if (backend === "minio") validateMinio(errors, env, minio);
  }

  // Database
  const dbUrl = env.DATABASE_URL ?? "";
  if (isProduction) {
    if (blank(dbUrl)) errors.push("DATABASE_URL is required");
    else if (
      !dbUrl.startsWith("postgresql://") &&
      !dbUrl.startsWith("postgres://")
    ) {
      errors.push("DATABASE_URL must be a PostgreSQL connection string");
    }
  }

  // MPT
  if (isProduction) {
    if (blank(env.MPT_BASE_URL)) errors.push("MPT_BASE_URL is required");
    if (blank(env.MPT_LOGIN)) errors.push("MPT_LOGIN is required");
    if (blank(env.MPT_PASSWORD)) errors.push("MPT_PASSWORD is required");
  }

  if (errors.length > 0) throw new ConfigValidationError(errors);

  const writeEnabled = bool(env.MPT_WRITE_ENABLED, false);
  if (isProduction && writeEnabled) {
    throw new ConfigValidationError([
      "MPT_WRITE_ENABLED=true is not permitted in this build (fail closed)",
    ]);
  }

  return {
    profile,
    isProduction,
    db: { url: dbUrl },
    jwt: { secret: jwtSecret, expiresIn: env.JWT_EXPIRES_IN ?? "1h" },
    kms: { profile: kmsProfile, fileDir: env.KMS_FILE_DIR ?? "", openbao },
    storage: { backend, localDir, minio },
    adapters: { mpt: mptMode, gs1: gs1Mode, nkt: nktMode, ecom: ecomMode },
    mpt: {
      baseUrl: env.MPT_BASE_URL ?? "",
      login: env.MPT_LOGIN ?? "",
      password: env.MPT_PASSWORD ?? "",
      requestTimeoutMs: num(env.MPT_REQUEST_TIMEOUT_MS, 15000),
      maxRetries: num(env.MPT_MAX_RETRIES, 2),
      productGroup: env.MPT_PRODUCT_GROUP ?? "motor-oils",
      businessPlaceId: env.MPT_BUSINESS_PLACE_ID ?? null,
      writeEnabled,
    },
  };
}

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
