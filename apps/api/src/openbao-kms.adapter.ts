import { Injectable, Logger } from "@nestjs/common";
import { IKmsAdapter } from "./kms.adapter";
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

// W0-03a: OpenBao Transit KMS adapter with validated envelope.
// Envelope format v1: version(1) || algo(1) || keyVer(4) || nonce(12) || tag(16) || payload || wrappedDEK || aadHash(32)

const FORMAT_VERSION = 1;
const AES_256_GCM = 1;

export interface OpenBaoKmsConfig {
  baseUrl: string;
  mount: string;
  key: string;
  token: string;
  timeoutMs: number;
}

export interface EnvelopeMetadata {
  organizationId: string;
  legalEntityId: string;
  objectId: string;
}

@Injectable()
export class OpenBaoTransitKmsAdapter implements IKmsAdapter {
  private readonly logger = new Logger(OpenBaoTransitKmsAdapter.name);
  private readonly cfg: OpenBaoKmsConfig;

  constructor(
    cfg: Partial<OpenBaoKmsConfig> & Pick<OpenBaoKmsConfig, "baseUrl" | "token">
  ) {
    this.cfg = {
      mount: "transit",
      key: "markflow-local",
      timeoutMs: 15000,
      ...cfg,
    };
  }

  private async transitPost(
    path: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = `${this.cfg.baseUrl}/v1/${this.cfg.mount}/${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vault-Token": this.cfg.token,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        this.logger.error(`OpenBao ${path} failed: ${res.status}`);
        throw new Error(`OpenBao ${path} failed (${res.status})`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async encrypt(
    plaintext: Buffer,
    meta: EnvelopeMetadata
  ): Promise<{ ciphertext: Buffer }> {
    const dek = randomBytes(32);
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", dek, nonce);
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    const wrapRes = await this.transitPost(`encrypt/${this.cfg.key}`, {
      plaintext: dek.toString("base64"),
    });
    const wrapData = wrapRes.data as {
      ciphertext: string;
      key_version: number;
    };

    const keyVerBuf = Buffer.alloc(4);
    keyVerBuf.writeUInt32BE(wrapData.key_version, 0);

    const aadHash = createHash("sha256")
      .update(
        `${meta.organizationId}:${meta.legalEntityId}:${meta.objectId}:${FORMAT_VERSION}:${AES_256_GCM}`
      )
      .digest();

    const envelope = Buffer.concat([
      Buffer.from([FORMAT_VERSION]),
      Buffer.from([AES_256_GCM]),
      keyVerBuf,
      nonce,
      tag,
      enc,
      Buffer.from(wrapData.ciphertext, "utf8"),
      aadHash,
    ]);

    // Zeroize DEK from memory
    dek.fill(0);
    return { ciphertext: envelope };
  }

  async decrypt(
    ciphertext: Buffer,
    meta: EnvelopeMetadata
  ): Promise<{ plaintext: Buffer }> {
    if (ciphertext.length < 2 + 4 + 12 + 16 + 32)
      throw new Error("Envelope too short");
    const fmtVer = ciphertext[0];
    const algo = ciphertext[1];
    if (fmtVer !== FORMAT_VERSION)
      throw new Error(`Unknown format version: ${fmtVer}`);
    if (algo !== AES_256_GCM) throw new Error(`Unknown algorithm: ${algo}`);

    const nonce = ciphertext.subarray(6, 18);
    const tag = ciphertext.subarray(18, 34);
    const aadHash = ciphertext.subarray(ciphertext.length - 32);

    // Validate AAD binding
    const expectedHash = createHash("sha256")
      .update(
        `${meta.organizationId}:${meta.legalEntityId}:${meta.objectId}:${FORMAT_VERSION}:${AES_256_GCM}`
      )
      .digest();
    if (!aadHash.equals(expectedHash))
      throw new Error("AAD binding mismatch — scope violation");

    const wrappedDekLen = ciphertext.length - 2 - 4 - 12 - 16 - 32;
    if (wrappedDekLen <= 0) throw new Error("Envelope missing wrapped DEK");

    const wrappedDek = ciphertext.subarray(34, 34 + wrappedDekLen);
    const encPayload = ciphertext.subarray(
      34 + wrappedDekLen,
      ciphertext.length - 32
    );

    // Unwrap DEK via OpenBao Transit
    const unwrapRes = await this.transitPost(`decrypt/${this.cfg.key}`, {
      ciphertext: wrappedDek.toString("utf8"),
    });
    const unwrapData = unwrapRes.data as { plaintext: string };
    const dek = Buffer.from(unwrapData.plaintext, "base64");

    // Decrypt payload
    const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(encPayload),
      decipher.final(),
    ]);

    // Zeroize DEK
    dek.fill(0);
    return { plaintext };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.cfg.baseUrl}/v1/sys/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
