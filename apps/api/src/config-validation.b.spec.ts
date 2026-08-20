import { describe, it, expect, beforeEach } from "vitest";
import {
  validateProductionConfig,
  ConfigValidationError,
  buildAppConfig,
  sanitizeHealthError,
  SECRET_SCAN_PATTERNS,
} from "./config-validation";

function prodEnv(
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@localhost:5432/mf",
    JWT_SECRET: "a-secure-production-secret-at-least-20-chars",
    ADAPTERS_MPT: "http",
    ADAPTERS_GS1: "http",
    ADAPTERS_NKT: "http",
    ADAPTERS_1ECOM: "http",
    KMS_PROFILE: "openbao",
    MPT_BASE_URL: "https://test.markirovka.kz",
    MPT_LOGIN: "svc",
    MPT_PASSWORD: "svc-password",
    MINIO_ENDPOINT: "localhost:9000",
    MINIO_ACCESS_KEY: "markflow",
    MINIO_SECRET_KEY: "markflow123",
    ...overrides,
  };
}

describe("W0-01b: stage rejects demo config", () => {
  it("stage + mock adapter throws", () => {
    expect(() =>
      validateProductionConfig(
        prodEnv({ NODE_ENV: "stage", ADAPTERS_MPT: "mock" })
      )
    ).toThrow(ConfigValidationError);
  });
  it("stage + file KMS throws", () => {
    expect(() =>
      validateProductionConfig(
        prodEnv({ NODE_ENV: "stage", KMS_PROFILE: "file" })
      )
    ).toThrow(ConfigValidationError);
  });
  it("stage + dev-secret throws", () => {
    expect(() =>
      validateProductionConfig(
        prodEnv({ NODE_ENV: "stage", JWT_SECRET: "dev-secret" })
      )
    ).toThrow(ConfigValidationError);
  });
  it("stage + valid config passes", () => {
    expect(() =>
      validateProductionConfig(prodEnv({ NODE_ENV: "stage" }))
    ).not.toThrow();
  });
});

describe("W0-01b: buildAppConfig", () => {
  it("returns typed AppConfig", () => {
    const cfg = buildAppConfig(prodEnv());
    expect(cfg.mode).toBe("production");
    expect(cfg.db.url).toContain("postgresql");
    expect(cfg.mpt.baseUrl).toBe("https://test.markirovka.kz");
    expect(cfg.kms.profile).toBe("openbao");
    expect(cfg.storage.local).toBe(false);
    expect(cfg.jwt.secret.length).toBeGreaterThanOrEqual(20);
    expect(cfg.adapters.mpt).toBe("http");
    expect(cfg.isProduction).toBe(true);
  });
  it("throws in production with mock adapter", () => {
    expect(() => buildAppConfig(prodEnv({ ADAPTERS_MPT: "mock" }))).toThrow(
      ConfigValidationError
    );
  });
  it("allows mock in test mode", () => {
    const cfg = buildAppConfig(
      prodEnv({ NODE_ENV: "test", ADAPTERS_MPT: "mock", KMS_PROFILE: "file" })
    );
    expect(cfg.adapters.mpt).toBe("mock");
    expect(cfg.kms.profile).toBe("file");
    expect(cfg.isProduction).toBe(false);
  });
  it("parses numeric MPT timeouts with defaults", () => {
    const cfg = buildAppConfig(prodEnv());
    expect(cfg.mpt.requestTimeoutMs).toBe(15000);
    expect(cfg.mpt.maxRetries).toBe(2);
    const cfg2 = buildAppConfig(
      prodEnv({ MPT_REQUEST_TIMEOUT_MS: "30000", MPT_MAX_RETRIES: "5" })
    );
    expect(cfg2.mpt.requestTimeoutMs).toBe(30000);
    expect(cfg2.mpt.maxRetries).toBe(5);
  });
  it("production rejects when http claimed but credentials missing", () => {
    expect(() => buildAppConfig(prodEnv({ MPT_LOGIN: "" }))).toThrow(
      ConfigValidationError
    );
  });
});

describe("W0-01b: health endpoint sanitization", () => {
  it("removes connection string fragments", () => {
    const s = sanitizeHealthError(
      "connection refused to postgresql://user:pass@host:5432/db timeout"
    );
    expect(s).not.toContain("postgresql://");
    expect(s).not.toContain("user:pass");
    expect(s).not.toContain("5432");
    expect(s).toContain("connection refused");
  });
  it("removes host:port patterns", () => {
    expect(
      sanitizeHealthError("connect ECONNREFUSED 127.0.0.1:5432")
    ).not.toContain("5432");
  });
  it("preserves error class name", () => {
    expect(sanitizeHealthError("PrismaClientKnownRequestError")).toBe(
      "PrismaClientKnownRequestError"
    );
  });
  it("truncates long messages", () => {
    const long = "x".repeat(500);
    expect(sanitizeHealthError(long).length).toBeLessThanOrEqual(200);
  });
});

describe("W0-01b: secret scan patterns", () => {
  it("detects MPT-style password assignment", () => {
    const hit = SECRET_SCAN_PATTERNS.find(([re]) =>
      re.test('MPT_PASSWORD = "s3cret-p@ss"')
    );
    expect(hit).toBeTruthy();
  });
  it("detects MinIO secret key", () => {
    const hit = SECRET_SCAN_PATTERNS.find(([re]) =>
      re.test('MINIO_SECRET_KEY = "minio12345"')
    );
    expect(hit).toBeTruthy();
  });
  it("detects JWT Bearer token literal", () => {
    const hit = SECRET_SCAN_PATTERNS.find(([re]) =>
      re.test(
        "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.xxxx"
      )
    );
    expect(hit).toBeTruthy();
  });
  it("does not flag empty or very short placeholder values", () => {
    const allMiss = SECRET_SCAN_PATTERNS.every(
      ([re]) => !re.test('MPT_PASSWORD = ""') && !re.test('MPT_PASSWORD = "x"')
    );
    expect(allMiss).toBe(true);
  });
});

describe("W0-01b: W0-01 regression guard", () => {
  let env: Record<string, string>;
  beforeEach(() => {
    env = prodEnv();
  });

  it("rejects dev-secret JWT in production", () => {
    env.JWT_SECRET = "dev-secret";
    expect(() => validateProductionConfig(env)).toThrow(ConfigValidationError);
  });
  it("rejects mock MPT adapter", () => {
    env.ADAPTERS_MPT = "mock";
    expect(() => validateProductionConfig(env)).toThrow(ConfigValidationError);
  });
  it("rejects file KMS", () => {
    env.KMS_PROFILE = "file";
    expect(() => validateProductionConfig(env)).toThrow(ConfigValidationError);
  });
  it("rejects local storage", () => {
    env.STORAGE_DIR = "./storage";
    expect(() => validateProductionConfig(env)).toThrow(ConfigValidationError);
  });
  it("collects multiple errors", () => {
    env.JWT_SECRET = "";
    env.ADAPTERS_MPT = "mock";
    env.KMS_PROFILE = "file";
    try {
      validateProductionConfig(env);
      expect.fail("should throw");
    } catch (e) {
      expect((e as ConfigValidationError).errors.length).toBeGreaterThanOrEqual(
        3
      );
    }
  });
  it("allows test mode", () => {
    expect(() =>
      validateProductionConfig(
        prodEnv({ NODE_ENV: "test", ADAPTERS_MPT: "mock" })
      )
    ).not.toThrow();
  });
});
