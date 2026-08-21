import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// W0-03a: Full local stack integration test.
// Verifies: config loading, adapter initialization, Code Vault encrypt/decrypt
// against real local MinIO and OpenBao. No external API calls.
// Skips if Docker stack is not running.

function isDockerStackRunning(): boolean {
  try {
    const output = execSync("docker ps --format {{.Names}}", {
      encoding: "utf8",
      timeout: 5000,
    });
    return (
      output.includes("markflow-local-openbao") &&
      output.includes("markflow-local-minio")
    );
  } catch {
    return false;
  }
}

describe("W0-03a local integration (Docker stack required)", () => {
  const canRun =
    existsSync(join(process.cwd(), ".env.local")) && isDockerStackRunning();

  (canRun ? it : it.skip)(
    "full local preflight: adapters initialize against Docker stack",
    async () => {
      // 1. Verify .env.local exists
      const envLocal = readFileSync(".env.local", "utf8");
      expect(envLocal).toContain("LOCAL_OPENBAO_ROOT_TOKEN=");

      // 2. Verify OpenBao Transit adapter works
      const { OpenBaoTransitKmsAdapter } =
        await import("../src/openbao-kms.adapter");
      let rootToken = "";
      envLocal.split("\n").forEach((line: string) => {
        if (line.trim().startsWith("LOCAL_OPENBAO_ROOT_TOKEN=")) {
          rootToken = line.split("=")[1];
        }
      });
      const kms = new OpenBaoTransitKmsAdapter({
        baseUrl: "http://127.0.0.1:8200",
        token: rootToken,
      });
      const { ciphertext } = await kms.encrypt(Buffer.from("integration-test"));
      const { plaintext } = await kms.decrypt(ciphertext);
      expect(plaintext.toString()).toBe("integration-test");

      // 3. Verify MinIO storage adapter works
      const { MinioStorageAdapter } =
        await import("../src/minio-storage.adapter");
      let accessKey = "",
        secretKey = "";
      envLocal.split("\n").forEach((line: string) => {
        if (line.trim().startsWith("LOCAL_MINIO_ACCESS_KEY="))
          accessKey = line.split("=")[1];
        if (line.trim().startsWith("LOCAL_MINIO_SECRET_KEY="))
          secretKey = line.split("=")[1];
      });
      const storage = new MinioStorageAdapter({
        endpoint: "localhost:9000",
        accessKey,
        secretKey,
        bucket: "markflow-local",
        tenantPrefix: "integration-test",
      });
      const key = await storage.write(Buffer.from("integration-test"));
      const data = await storage.read(key);
      expect(data.toString()).toBe("integration-test");

      // 4. Verify Code Vault encrypt/decrypt through adapters
      const vaultPlaintext = Buffer.from(
        JSON.stringify({ serial: "TEST-001", ai91: null, ai92: null })
      );
      const { ciphertext: vaultCiphertext } = await kms.encrypt(vaultPlaintext);
      const { plaintext: vaultDecrypted } = await kms.decrypt(vaultCiphertext);
      expect(JSON.parse(vaultDecrypted.toString())).toEqual({
        serial: "TEST-001",
        ai91: null,
        ai92: null,
      });

      // 5. Verify config validation rejects invalid profiles in production
      const { buildAppConfig } = await import("../src/config-validation");
      expect(() =>
        buildAppConfig({ NODE_ENV: "production", KMS_PROFILE: "file" })
      ).toThrow();
    },
    60000
  );
});
