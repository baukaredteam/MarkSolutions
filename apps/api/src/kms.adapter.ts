import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
export const KMS_ADAPTER = "KMS_ADAPTER";

// Порт KMS (W3, CV-030): file-KMS dev / OpenBao prod через KMS_PROFILE.
export interface EnvelopeMetadata {
  organizationId: string;
  legalEntityId: string;
  objectId: string;
}

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

// AES-256-GCM с per-row nonce (12 байт) рядом с ciphertext + tag (16 байт).
// Хранение: base64(nonce || tag || ciphertext).
@Injectable()
export class FileKmsAdapter implements IKmsAdapter {
  private readonly keyPath: string;

  constructor() {
    this.keyPath = join(
      process.env.KMS_FILE_DIR ?? join(process.cwd(), "kms-keys"),
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
    // формат: nonce(12) || tag(16) || ciphertext
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

// OpenBao prod — заглушка (реализуется при деплое; тот же интерфейс).
@Injectable()
export class VaultKmsAdapter implements IKmsAdapter {
  async encrypt(
    plaintext: Buffer,
    _meta: EnvelopeMetadata
  ): Promise<{ ciphertext: Buffer }> {
    void plaintext;
    throw new Error(
      "VaultKmsAdapter: OpenBao не подключён (KMS_PROFILE=openbao требует деплой)"
    );
  }
  async decrypt(
    ciphertext: Buffer,
    _meta: EnvelopeMetadata
  ): Promise<{ plaintext: Buffer }> {
    void ciphertext;
    throw new Error("VaultKmsAdapter: OpenBao не подключён");
  }
}
