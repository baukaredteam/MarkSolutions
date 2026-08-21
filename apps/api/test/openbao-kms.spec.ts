import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { OpenBaoTransitKmsAdapter } from "../src/openbao-kms.adapter";

// W0-03a: OpenBao Transit KMS adapter integration test.
// Requires local Docker stack (OpenBao on 127.0.0.1:8200 with Transit enabled).
// Root token use is smoke-only; forbidden for W0-03a application adapters.

function isBaoRunning(): boolean {
  try {
    const output = execSync("docker ps --format {{.Names}}", {
      encoding: "utf8",
      timeout: 5000,
    });
    return output.includes("markflow-local-openbao");
  } catch {
    return false;
  }
}

const hasBao = existsSync(join(process.cwd(), ".env.local")) && isBaoRunning();

describe.skipIf(!hasBao)("OpenBaoTransitKmsAdapter (integration)", () => {
  let adapter: OpenBaoTransitKmsAdapter;
  let rootToken: string;

  beforeAll(() => {
    const fs = require("node:fs");
    const envLocal = fs.readFileSync(".env.local", "utf8");
    envLocal.split("\n").forEach((line: string) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("LOCAL_OPENBAO_ROOT_TOKEN="))
        rootToken = trimmed.split("=")[1];
    });
    adapter = new OpenBaoTransitKmsAdapter({
      baseUrl: "http://127.0.0.1:8200",
      token: rootToken,
      mount: "transit",
      key: "markflow-local",
      timeoutMs: 10000,
    });
  });

  it("healthCheck returns true when OpenBao is running", async () => {
    const healthy = await adapter.healthCheck();
    expect(healthy).toBe(true);
  });

  it("encrypt returns ciphertext with version byte", async () => {
    const plaintext = Buffer.from("secret-markflow-data");
    const { ciphertext } = await adapter.encrypt(plaintext);
    expect(ciphertext).toBeInstanceOf(Buffer);
    expect(ciphertext.length).toBeGreaterThan(plaintext.length);
    expect(ciphertext[0]).toBeGreaterThanOrEqual(1);
  });

  it("decrypt round-trip returns original plaintext", async () => {
    const plaintext = Buffer.from("round-trip-test-data-123");
    const { ciphertext } = await adapter.encrypt(plaintext);
    const { plaintext: decrypted } = await adapter.decrypt(ciphertext);
    expect(decrypted.toString()).toBe("round-trip-test-data-123");
  });

  it("encrypt/decrypt works with binary data", async () => {
    const plaintext = Buffer.from([0x00, 0x01, 0xff, 0xfe]);
    const { ciphertext } = await adapter.encrypt(plaintext);
    const { plaintext: decrypted } = await adapter.decrypt(ciphertext);
    expect(decrypted).toEqual(plaintext);
  });

  it("decrypt fails with wrong ciphertext", async () => {
    const fakeCiphertext = Buffer.from([
      1,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      "invalid-base64-data",
    ]);
    await expect(adapter.decrypt(fakeCiphertext)).rejects.toThrow();
  });
});
