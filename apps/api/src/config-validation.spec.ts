import { describe, it, expect } from "vitest";
import {
  resolveProfile,
  buildAppConfig,
  ConfigValidationError,
  sanitizeHealthError,
  SECRET_SCAN_PATTERNS,
} from "./config-validation";

function env(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    APP_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/markflow",
    JWT_SECRET: "a-secure-production-secret-at-least-20-characters",
    ADAPTERS_MPT: "http",
    ADAPTERS_GS1: "http",
    ADAPTERS_NKT: "http",
    ADAPTERS_1ECOM: "http",
    KMS_PROFILE: "openbao",
    KMS_OPENBAO_ADDR: "openbao:8200",
    KMS_OPENBAO_TOKEN: "restricted-token",
    MPT_BASE_URL: "https://test.markirovka.kz",
    MPT_LOGIN: "svc-login",
    MPT_PASSWORD: "svc-password",
    MINIO_ENDPOINT: "localhost:9000",
    MINIO_ACCESS_KEY: "markflow",
    MINIO_SECRET_KEY: "markflow123",
    MINIO_BUCKET: "markflow-codes",
    MINIO_REGION: "us-east-1",
    ...overrides,
  };
}

describe("resolveProfile (W0-03a)", () => {
  it("resolves each canonical APP_ENV", () => {
    for (const p of ["test", "local", "stage", "production"]) {
      expect(resolveProfile({ APP_ENV: p })).toBe(p);
    }
  });

  it("rejects unknown APP_ENV", () => {
    expect(() => resolveProfile({ APP_ENV: "development" })).toThrow(
      ConfigValidationError
    );
    expect(() => resolveProfile({ APP_ENV: "prod" })).toThrow(
      ConfigValidationError
    );
  });

  it("maps NODE_ENV=development to local only when APP_ENV absent", () => {
    expect(resolveProfile({ NODE_ENV: "development" })).toBe("local");
    expect(
      resolveProfile({ APP_ENV: "production", NODE_ENV: "development" })
    ).toBe("production");
  });

  it("rejects empty profile (no APP_ENV, no NODE_ENV)", () => {
    expect(() => resolveProfile({})).toThrow(ConfigValidationError);
  });
});

describe("buildAppConfig — stage/production reject demo config", () => {
  it("accepts a complete production config", () => {
    expect(() => buildAppConfig(env())).not.toThrow();
  });

  it("rejects FileKMS (KMS_PROFILE=file)", () => {
    expect(() => buildAppConfig(env({ KMS_PROFILE: "file" }))).toThrow(
      /openbao required/
    );
  });

  it("rejects LocalStorage (STORAGE_DIR set)", () => {
    expect(() => buildAppConfig(env({ STORAGE_DIR: "./storage" }))).toThrow(
      /STORAGE_DIR/
    );
  });

  it("rejects mock adapters", () => {
    expect(() => buildAppConfig(env({ ADAPTERS_MPT: "mock" }))).toThrow(
      /http adapter required/
    );
    expect(() => buildAppConfig(env({ ADAPTERS_GS1: "mock" }))).toThrow(
      /http adapter required/
    );
  });

  it("requires complete MinIO fields", () => {
    expect(() => buildAppConfig(env({ MINIO_ENDPOINT: "" }))).toThrow(
      /MINIO_ENDPOINT/
    );
    expect(() => buildAppConfig(env({ MINIO_BUCKET: "" }))).toThrow(
      /MINIO_BUCKET/
    );
    expect(() => buildAppConfig(env({ MINIO_ACCESS_KEY: "" }))).toThrow(
      /MINIO_ACCESS_KEY/
    );
  });

  it("requires complete OpenBao fields", () => {
    expect(() => buildAppConfig(env({ KMS_OPENBAO_ADDR: "" }))).toThrow(
      /KMS_OPENBAO_ADDR/
    );
    expect(() => buildAppConfig(env({ KMS_OPENBAO_TOKEN: "" }))).toThrow(
      /KMS_OPENBAO_TOKEN/
    );
  });

  it("rejects dev-secret / short JWT", () => {
    expect(() => buildAppConfig(env({ JWT_SECRET: "dev-secret" }))).toThrow(
      /dev-secret/
    );
    expect(() => buildAppConfig(env({ JWT_SECRET: "short" }))).toThrow(
      /at least 20/
    );
  });

  it("rejects non-PostgreSQL DATABASE_URL", () => {
    expect(() =>
      buildAppConfig(env({ DATABASE_URL: "file:./dev.db" }))
    ).toThrow(/PostgreSQL/);
  });

  it("rejects missing MPT fields", () => {
    expect(() => buildAppConfig(env({ MPT_BASE_URL: "" }))).toThrow(
      /MPT_BASE_URL/
    );
    expect(() => buildAppConfig(env({ MPT_LOGIN: "" }))).toThrow(/MPT_LOGIN/);
  });

  it("rejects MPT_WRITE_ENABLED=true (fail closed)", () => {
    expect(() => buildAppConfig(env({ MPT_WRITE_ENABLED: "true" }))).toThrow(
      /fail closed/
    );
  });

  it("collects multiple errors", () => {
    try {
      buildAppConfig(
        env({ JWT_SECRET: "", KMS_PROFILE: "file", ADAPTERS_MPT: "mock" })
      );
      expect.fail("should throw");
    } catch (e) {
      expect((e as ConfigValidationError).errors.length).toBeGreaterThanOrEqual(
        3
      );
    }
  });
});

describe("buildAppConfig — local/test allow dev config", () => {
  it("allows file KMS, mock adapters, dev-secret in test", () => {
    const cfg = buildAppConfig({
      APP_ENV: "test",
      JWT_SECRET: "dev-secret",
      KMS_PROFILE: "file",
      ADAPTERS_MPT: "mock",
      STORAGE_DIR: "./storage",
    });
    expect(cfg.kms.profile).toBe("file");
    expect(cfg.adapters.mpt).toBe("mock");
    expect(cfg.storage.backend).toBe("local");
    expect(cfg.isProduction).toBe(false);
  });

  it("rejects root token used as adapter token in local/test", () => {
    expect(() =>
      buildAppConfig({
        APP_ENV: "local",
        JWT_SECRET: "dev-secret",
        KMS_PROFILE: "openbao",
        KMS_OPENBAO_ADDR: "localhost:8200",
        KMS_OPENBAO_TOKEN: "the-root-token",
        LOCAL_OPENBAO_ROOT_TOKEN: "the-root-token",
      })
    ).toThrow(/root token/);
  });

  it("defaults MPT_WRITE_ENABLED to false", () => {
    const cfg = buildAppConfig({ APP_ENV: "test", JWT_SECRET: "dev-secret" });
    expect(cfg.mpt.writeEnabled).toBe(false);
  });
});

describe("sanitizeHealthError", () => {
  it("removes connection strings and host:port", () => {
    const s = sanitizeHealthError(
      "refused postgresql://u:p@host:5432/db timeout"
    );
    expect(s).not.toContain("postgresql://");
    expect(s).not.toContain("5432");
  });
  it("truncates long messages", () => {
    expect(sanitizeHealthError("x".repeat(500)).length).toBeLessThanOrEqual(
      200
    );
  });
});

describe("SECRET_SCAN_PATTERNS", () => {
  it("detects MPT password assignment", () => {
    expect(
      SECRET_SCAN_PATTERNS.some(([re]) =>
        re.test('MPT_PASSWORD = "s3cret-p@ss"')
      )
    ).toBe(true);
  });
  it("detects MinIO secret key", () => {
    expect(
      SECRET_SCAN_PATTERNS.some(([re]) =>
        re.test('MINIO_SECRET_KEY = "minio12345"')
      )
    ).toBe(true);
  });
});
