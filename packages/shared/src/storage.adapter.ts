import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface StorageAdapter {
  write(data: Buffer): Promise<string>;
  read(key: string): Promise<Buffer>;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly root: string) {}

  async write(data: Buffer): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const key = randomUUID();
    await writeFile(join(this.root, key), data);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    const safe = this.sanitize(key);
    return readFile(join(this.root, safe));
  }

  private sanitize(key: string): string {
    if (
      !key ||
      key.includes("..") ||
      key.includes("/") ||
      key.includes("\\") ||
      key.startsWith(".")
    ) {
      throw new Error(`invalid storage key: ${key}`);
    }
    return key;
  }
}
