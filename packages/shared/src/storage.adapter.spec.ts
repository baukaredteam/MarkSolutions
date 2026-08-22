import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStorageAdapter } from "./storage.adapter";

describe("LocalStorageAdapter", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "storage-test-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("roundtrips bytes through a local file", async () => {
    const adapter = new LocalStorageAdapter(dir);
    const payload = Buffer.from("label-datamatrix-ecc200");

    const key = await adapter.write("org-1", "le-1", payload);
    const read = await adapter.read("org-1", "le-1", key);

    expect(read.equals(payload)).toBe(true);
  });

  it("rejects path traversal keys", async () => {
    const adapter = new LocalStorageAdapter(dir);
    await expect(adapter.read("org-1", "le-1", "../secret")).rejects.toThrow(
      /invalid storage key/
    );
    await expect(adapter.read("org-1", "le-1", "a/b")).rejects.toThrow(
      /invalid storage key/
    );
    await expect(adapter.read("org-1", "le-1", "..\\win")).rejects.toThrow(
      /invalid storage key/
    );
  });
});
