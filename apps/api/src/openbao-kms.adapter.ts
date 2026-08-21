import { Injectable, Logger } from "@nestjs/common";
import { IKmsAdapter } from "./kms.adapter";

// W0-03a: OpenBao Transit KMS adapter via HTTP API.
// Encrypts/decrypts using OpenBao's Transit secrets engine.
// Format: version(1) || nonce(12) || tag(16) || ciphertext

export interface OpenBaoKmsConfig {
  baseUrl: string; // e.g. http://127.0.0.1:8200
  mount: string; // e.g. transit
  key: string; // e.g. markflow-local
  token: string; // auth token (ephemeral in dev; mounted secret in prod)
  timeoutMs: number; // HTTP request timeout
}

@Injectable()
export class OpenBaoTransitKmsAdapter implements IKmsAdapter {
  private readonly logger = new Logger(OpenBaoTransitKmsAdapter.name);
  private readonly config: OpenBaoKmsConfig;

  constructor(
    config: Partial<OpenBaoKmsConfig> &
      Pick<OpenBaoKmsConfig, "baseUrl" | "token">
  ) {
    this.config = {
      mount: "transit",
      key: "markflow-local",
      timeoutMs: 15000,
      ...config,
    };
  }

  private async request(
    path: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = `${this.config.baseUrl}/v1/${this.config.mount}/${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vault-Token": this.config.token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          typeof data?.errors === "object"
            ? JSON.stringify(data.errors)
            : String(data);
        this.logger.error(`OpenBao ${path} failed: ${res.status}`);
        throw new Error(
          `OpenBao ${path} failed (${res.status}): ${msg.slice(0, 200)}`
        );
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async encrypt(plaintext: Buffer): Promise<{ ciphertext: Buffer }> {
    const result = await this.request(`encrypt/${this.config.key}`, {
      plaintext: plaintext.toString("base64"),
    });
    const data = result.data as
      { ciphertext: string; key_version: number } | undefined;
    if (!data?.ciphertext)
      throw new Error("OpenBao encrypt: no ciphertext in response");

    // Format: version(1) || ciphertext (raw OpenBao ciphertext)
    const v = Buffer.from([data.key_version & 0xff]);
    const cipherBuf = Buffer.from(data.ciphertext, "utf8");
    return { ciphertext: Buffer.concat([v, cipherBuf]) };
  }

  async decrypt(ciphertext: Buffer): Promise<{ plaintext: Buffer }> {
    // First byte is version number (not used in current version; reserved for future)
    const cipherBuf = ciphertext.subarray(1).toString("utf8");

    const result = await this.request(`decrypt/${this.config.key}`, {
      ciphertext: cipherBuf,
    });
    const data = result.data as { plaintext: string } | undefined;
    if (!data?.plaintext)
      throw new Error("OpenBao decrypt: no plaintext in response");

    return { plaintext: Buffer.from(data.plaintext, "base64") };
  }

  /** Check OpenBao Transit health (for readiness probe). */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.config.baseUrl}/v1/sys/health`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
