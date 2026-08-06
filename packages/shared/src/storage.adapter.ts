import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export class LocalStorageAdapter {
  constructor(private readonly root: string) {}

  async write(data: Buffer): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const key = randomUUID();
    await writeFile(join(this.root, key), data);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(join(this.root, key));
  }
}
