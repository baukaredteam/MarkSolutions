import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { MinioStorageAdapter } from "../src/minio-storage.adapter";

// W0-03a: MinIO storage adapter integration test.
// Requires local Docker stack (MinIO on 127.0.0.1:9000).

function isMinioRunning(): boolean {
  try {
    const output = execSync("docker ps --format {{.Names}}", {
      encoding: "utf8",
      timeout: 5000,
    });
    return output.includes("markflow-local-minio");
  } catch {
    return false;
  }
}

const hasMinio =
  existsSync(join(process.cwd(), ".env.local")) && isMinioRunning();

describe.skipIf(!hasMinio)("MinioStorageAdapter (integration)", () => {
  let adapter: MinioStorageAdapter;
  const envVars: Record<string, string> = {};

  beforeAll(() => {
    const fs = require("node:fs");
    const envLocal = fs.readFileSync(".env.local", "utf8");
    envLocal.split("\n").forEach((line: string) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("LOCAL_MINIO_ACCESS_KEY="))
        envVars.accessKey = trimmed.split("=")[1];
      if (trimmed.startsWith("LOCAL_MINIO_SECRET_KEY="))
        envVars.secretKey = trimmed.split("=")[1];
    });
    adapter = new MinioStorageAdapter({
      endpoint: "localhost:9000",
      accessKey: envVars.accessKey,
      secretKey: envVars.secretKey,
      bucket: "markflow-local",
      useSsl: false,
      timeoutMs: 10000,
      tenantPrefix: "test-tenant",
    });
  });

  it("write returns a key with tenant prefix", async () => {
    const key = await adapter.write(Buffer.from("test-content"));
    expect(key).toMatch(/^test-tenant\//);
  });

  it("read returns the written data", async () => {
    const data = Buffer.from("hello-markflow");
    const key = await adapter.write(data);
    const readData = await adapter.read(key);
    expect(readData.toString()).toBe("hello-markflow");
  });

  it("read rejects path traversal", async () => {
    await expect(adapter.read("../etc/passwd")).rejects.toThrow(
      /Invalid storage key/
    );
  });

  it("read rejects keys without tenant prefix", async () => {
    await expect(adapter.read("other-tenant/some-key")).rejects.toThrow(
      /tenant prefix/
    );
  });

  it("write/read round-trip with binary data", async () => {
    const data = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x80]);
    const key = await adapter.write(data);
    const readData = await adapter.read(key);
    expect(readData).toEqual(data);
  });
});
