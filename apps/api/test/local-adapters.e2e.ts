import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { AppModule } from "../src/app.module";
import { KMS_ADAPTER, IKmsAdapter } from "../src/kms.adapter";
import { STORAGE_ADAPTER } from "../src/files.controller";
import { OpenBaoTransitKmsAdapter } from "../src/openbao-kms.adapter";
import { MinioStorageAdapter } from "../src/minio-storage.adapter";
import { StorageAdapter } from "@markflow/shared";
import {
  buildAppConfig,
  ConfigValidationError,
} from "../src/config-validation";
import {
  createTestDatabase,
  teardownTestDatabase,
  type TestDb,
} from "./harness";

// W0-03a local-adapters integration suite. Runs against a REAL Docker local
// stack (OpenBao restricted token + MinIO + PostgreSQL) using the production DI
// factories. It NEVER skips: missing preconditions fail the suite (fail closed).
//
// Run via: npm run test:local-adapters  (never via the default `npm test`).

const org = "org-1";
const le = "le-1";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `test:local-adapters precondition missing: ${name} is required`
    );
  }
  return v;
}

describe("W0-03a local adapters (OpenBao + MinIO, production DI)", () => {
  let testDb: TestDb;
  let kms: IKmsAdapter;
  let storage: StorageAdapter;

  beforeAll(async () => {
    const token = requireEnv("LOCAL_OPENBAO_ADAPTER_TOKEN");
    const rootToken = process.env.LOCAL_OPENBAO_ROOT_TOKEN ?? "";
    if (rootToken && rootToken === token) {
      throw new Error("LOCAL_OPENBAO_ADAPTER_TOKEN must not be the root token");
    }

    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.databaseUrl;
    process.env.APP_ENV = "local";
    process.env.KMS_PROFILE = "openbao";
    process.env.KMS_OPENBAO_ADDR = requireEnv("KMS_OPENBAO_ADDR");
    process.env.KMS_OPENBAO_TOKEN = token;
    process.env.MINIO_ENDPOINT = requireEnv("MINIO_ENDPOINT");
    process.env.MINIO_ACCESS_KEY = requireEnv("MINIO_ACCESS_KEY");
    process.env.MINIO_SECRET_KEY = requireEnv("MINIO_SECRET_KEY");
    process.env.MINIO_BUCKET = requireEnv("MINIO_BUCKET");
    process.env.MINIO_REGION = process.env.MINIO_REGION ?? "us-east-1";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    kms = moduleRef.get(KMS_ADAPTER);
    storage = moduleRef.get(STORAGE_ADAPTER);
  });

  afterAll(async () => {
    await teardownTestDatabase(testDb).catch(() => {});
  });

  it("registers the real OpenBao + MinIO adapters (not file/local stubs)", () => {
    expect(kms).toBeInstanceOf(OpenBaoTransitKmsAdapter);
    expect(storage).toBeInstanceOf(MinioStorageAdapter);
  });

  it("KMS normal round trip", async () => {
    const meta = { organizationId: org, legalEntityId: le, objectId: "code-1" };
    const payload = Buffer.from(
      JSON.stringify({ serial: "9000001", ai91: null, ai92: null })
    );
    const { ciphertext } = await kms.encrypt(payload, meta);
    const { plaintext } = await kms.decrypt(ciphertext, meta);
    expect(plaintext.equals(payload)).toBe(true);
  });

  it("KMS cross-organization deny", async () => {
    const meta = { organizationId: org, legalEntityId: le, objectId: "code-1" };
    const { ciphertext } = await kms.encrypt(Buffer.from("x"), meta);
    await expect(
      kms.decrypt(ciphertext, { ...meta, organizationId: "org-2" })
    ).rejects.toThrow();
  });

  it("KMS cross-legal-entity deny", async () => {
    const meta = { organizationId: org, legalEntityId: le, objectId: "code-1" };
    const { ciphertext } = await kms.encrypt(Buffer.from("x"), meta);
    await expect(
      kms.decrypt(ciphertext, { ...meta, legalEntityId: "le-2" })
    ).rejects.toThrow();
  });

  it("storage round trip + traversal deny", async () => {
    const key = await storage.write(org, le, Buffer.from("bytes"));
    const read = await storage.read(org, le, key);
    expect(read.toString()).toBe("bytes");
    await expect(storage.read(org, le, "../evil")).rejects.toThrow();
    await expect(storage.read(org, le, "other-org/le/x")).rejects.toThrow();
  });

  it("rejects malformed / tampered envelope", async () => {
    const meta = { organizationId: org, legalEntityId: le, objectId: "code-2" };
    const { ciphertext } = await kms.encrypt(Buffer.from("secret"), meta);
    await expect(kms.decrypt(Buffer.from("MFV1"), meta)).rejects.toThrow();
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] ^= 0xff;
    await expect(kms.decrypt(tampered, meta)).rejects.toThrow();
  });

  it("rejects denied token (wrong identity)", async () => {
    const meta = { organizationId: org, legalEntityId: le, objectId: "code-3" };
    const bad = new OpenBaoTransitKmsAdapter({
      addr: requireEnv("KMS_OPENBAO_ADDR"),
      useTls: false,
      ca: "",
      mount: "transit",
      key: "markflow-local",
      token: "denied-token",
      timeoutMs: 3000,
    });
    await expect(bad.encrypt(Buffer.from("x"), meta)).rejects.toThrow();
  });

  it("rejects unknown profile exactly", () => {
    expect(() => buildAppConfig({ APP_ENV: "development" })).toThrow(
      ConfigValidationError
    );
    expect(() => buildAppConfig({})).toThrow(ConfigValidationError);
  });

  it("adapter readiness (healthCheck)", async () => {
    const bao = kms as unknown as { healthCheck?: () => Promise<boolean> };
    const minio = storage as unknown as {
      healthCheck?: () => Promise<boolean>;
    };
    expect(typeof bao.healthCheck).toBe("function");
    expect(await bao.healthCheck?.()).toBe(true);
    expect(await minio.healthCheck?.()).toBe(true);
  });
});
