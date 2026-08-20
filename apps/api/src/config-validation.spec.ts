import { describe, it, expect, beforeEach } from "vitest";
import {
  validateProductionConfig,
  ConfigValidationError,
} from "./config-validation";

function makeEnv(
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/markflow",
    JWT_SECRET: "a-secure-production-secret-at-least-20-characters",
    ADAPTERS_MPT: "http",
    ADAPTERS_GS1: "http",
    ADAPTERS_NKT: "http",
    ADAPTERS_1ECOM: "http",
    KMS_PROFILE: "openbao",
    MPT_BASE_URL: "https://test.markirovka.kz",
    MPT_LOGIN: "svc-login",
    MPT_PASSWORD: "svc-password",
    MINIO_ENDPOINT: "localhost:9000",
    MINIO_ACCESS_KEY: "markflow",
    MINIO_SECRET_KEY: "markflow123",
    ...overrides,
  };
}

describe("validateProductionConfig", () => {
  let env: Record<string, string>;

  beforeEach(() => {
    env = makeEnv();
  });

  it("passes with a valid production configuration", () => {
    expect(() => validateProductionConfig(env)).not.toThrow();
  });

  describe("rejects dev-secret JWT in production", () => {
    it("rejects default dev-secret", () => {
      env.JWT_SECRET = "dev-secret";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
      expect(() => validateProductionConfig(env)).toThrow(
        /dev-secret.*unique secret/
      );
    });

    it("rejects short secrets", () => {
      env.JWT_SECRET = "short";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
      expect(() => validateProductionConfig(env)).toThrow(
        /at least 20 characters/
      );
    });
  });

  describe("rejects mock adapters in production", () => {
    it("rejects ADAPTERS_MPT=mock", () => {
      env.ADAPTERS_MPT = "mock";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
      expect(() => validateProductionConfig(env)).toThrow(/MPT.*mock/);
    });

    it("rejects ADAPTERS_GS1=mock", () => {
      env.ADAPTERS_GS1 = "mock";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
    });

    it("rejects ADAPTERS_NKT=mock", () => {
      env.ADAPTERS_NKT = "mock";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
    });

    it("rejects ADAPTERS_1ECOM=mock", () => {
      env.ADAPTERS_1ECOM = "mock";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
    });
  });

  describe("rejects FileKMS in production", () => {
    it("rejects KMS_PROFILE=file", () => {
      env.KMS_PROFILE = "file";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
      expect(() => validateProductionConfig(env)).toThrow(/KMS.*file/);
    });

    it("rejects KMS_PROFILE unset (defaults to file)", () => {
      delete env.KMS_PROFILE;
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
    });
  });

  describe("rejects LocalStorage in production", () => {
    it("rejects STORAGE_DIR set (local filesystem)", () => {
      env.STORAGE_DIR = "./storage";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
      expect(() => validateProductionConfig(env)).toThrow(/STORAGE_DIR/);
    });
  });

  describe("rejects missing required variables", () => {
    it("rejects missing DATABASE_URL", () => {
      delete env.DATABASE_URL;
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
      expect(() => validateProductionConfig(env)).toThrow(/DATABASE_URL/);
    });

    it("rejects non-PostgreSQL DATABASE_URL", () => {
      env.DATABASE_URL = "file:./dev.db";
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
      expect(() => validateProductionConfig(env)).toThrow(/PostgreSQL/);
    });

    it("rejects missing MPT_BASE_URL", () => {
      delete env.MPT_BASE_URL;
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
    });

    it("rejects missing MPT credentials", () => {
      delete env.MPT_LOGIN;
      delete env.MPT_PASSWORD;
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
    });

    it("rejects missing MINIO_ENDPOINT", () => {
      delete env.MINIO_ENDPOINT;
      expect(() => validateProductionConfig(env)).toThrow(
        ConfigValidationError
      );
    });

    it("collects multiple errors in a single throw", () => {
      delete env.DATABASE_URL;
      delete env.JWT_SECRET;
      env.KMS_PROFILE = "file";
      env.MPT_LOGIN = "";
      try {
        validateProductionConfig(env);
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigValidationError);
        expect(e.errors.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe("allows mock adapters in test/dev mode", () => {
    it("no throw when NODE_ENV=test", () => {
      env.NODE_ENV = "test";
      env.ADAPTERS_MPT = "mock";
      env.KMS_PROFILE = "file";
      env.JWT_SECRET = "dev-secret";
      env.STORAGE_DIR = "./storage";
      expect(() => validateProductionConfig(env)).not.toThrow();
    });

    it("no throw when NODE_ENV=development", () => {
      env.NODE_ENV = "development";
      env.ADAPTERS_MPT = "mock";
      env.KMS_PROFILE = "file";
      env.JWT_SECRET = "dev-secret";
      env.STORAGE_DIR = "./storage";
      expect(() => validateProductionConfig(env)).not.toThrow();
    });

    it("no throw when NODE_ENV is unset", () => {
      delete env.NODE_ENV;
      env.ADAPTERS_MPT = "mock";
      env.KMS_PROFILE = "file";
      env.JWT_SECRET = "dev-secret";
      env.STORAGE_DIR = "./storage";
      expect(() => validateProductionConfig(env)).not.toThrow();
    });
  });

  describe("allows env=stage (warnings only)", () => {
    it("no throw when NODE_ENV=stage", () => {
      env.NODE_ENV = "stage";
      env.ADAPTERS_MPT = "http";
      expect(() => validateProductionConfig(env)).not.toThrow();
    });
  });
});
