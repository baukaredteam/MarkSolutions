import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnvelopeMeta } from "./envelope-codec";

export const KMS_ADAPTER = "KMS_ADAPTER";

// Port KMS (W3, CV-030): file-KMS dev / OpenBao prod (ADR-026).
export type EnvelopeMetadata = EnvelopeMeta;

export interface IKmsAdapter {
  encrypt(
    plaintext: Buffer,
    meta: EnvelopeMetadata
  ): Promise<{ ciphertext: Buffer }>;
  decrypt(
    ciphertext: Buffer,
    meta: EnvelopeMetadata
  ): Promise<{ plaintext: Buffer }>;
}

// File-KMS (dev/local only, ADR-026): AES-256-GCM with per-row nonce.
// Storage: nonce(12) || tag(16) || ciphertext. NOT permitted in stage/production.
@Injectable()
export class FileKmsAdapter implements IKmsAdapter {
  private readonly keyPath: string;

  constructor(fileDir: string) {
    this.keyPath = join(
      fileDir || join(process.cwd(), "kms-keys"),
      "aes256.key"
    );
  }

  private async getKey(): Promise<Buffer> {
    try {
      return await readFile(this.keyPath);
    } catch {
      await mkdir(join(this.keyPath, ".."), { recursive: true });
      const key = randomBytes(32);
      await writeFile(this.keyPath, key, { mode: 0o600 });
      return key;
    }
  }

  async encrypt(
    plaintext: Buffer,
    _meta: EnvelopeMetadata
  ): Promise<{ ciphertext: Buffer }> {
    const key = await this.getKey();
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { ciphertext: Buffer.concat([nonce, tag, enc]) };
  }

  async decrypt(
    ciphertext: Buffer,
    _meta: EnvelopeMetadata
  ): Promise<{ plaintext: Buffer }> {
    const key = await this.getKey();
    const nonce = ciphertext.subarray(0, 12);
    const tag = ciphertext.subarray(12, 28);
    const enc = ciphertext.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    return {
      plaintext: Buffer.concat([decipher.update(enc), decipher.final()]),
    };
  }
}
