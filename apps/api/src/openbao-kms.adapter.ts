import { Injectable, Logger } from "@nestjs/common";
import type { Agent } from "node:https";
import {
  EnvelopeCodec,
  EnvelopeError,
  EnvelopeMeta,
  DekWrapper,
} from "./envelope-codec";
import type { IKmsAdapter } from "./kms.adapter";
import type { OpenBaoConfig } from "./config-validation";

// W0-03a — OpenBao Transit KMS adapter (ADR-026).
//
// Composition over the pure EnvelopeCodec: this adapter only owns transport —
// transit wrap/unwrap of the per-object DEK — and strict response validation.
// The binary envelope framing, AES-256-GCM, canonical AAD binding and zeroize
// all live in EnvelopeCodec (unit-tested without OpenBao).

interface TransitEncryptResponse {
  data?: { ciphertext?: string; key_version?: number };
}

interface TransitDecryptResponse {
  data?: { plaintext?: string; key_version?: number };
}

export class OpenBaoResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenBaoResponseError";
  }
}

/** Extract key version from a `vault:v{N}:...` ciphertext prefix (API semantics). */
function parseTransitVersion(ciphertext: string): number | null {
  const m = /^vault:v(\d+):/.exec(ciphertext ?? "");
  return m ? Number(m[1]) : null;
}

@Injectable()
export class OpenBaoTransitKmsAdapter implements IKmsAdapter {
  private readonly logger = new Logger(OpenBaoTransitKmsAdapter.name);
  private readonly codec: EnvelopeCodec;
  private readonly cfg: OpenBaoConfig;
  private readonly agent: Agent | undefined;

  constructor(cfg: OpenBaoConfig) {
    this.cfg = cfg;
    this.codec = new EnvelopeCodec(cfg.key);
    if (cfg.useTls && cfg.ca) {
      const https = require("node:https") as typeof import("node:https");
      this.agent = new https.Agent({ ca: cfg.ca });
    }
  }

  private async transitPost(
    path: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const scheme = this.cfg.useTls ? "https" : "http";
    const url = `${scheme}://${this.cfg.addr}/v1/${this.cfg.mount}/${path}`;
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
        agent: this.agent,
      } as RequestInit);
      const data = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!res.ok || !data) {
        this.logger.error(`OpenBao ${path} failed: ${res.status}`);
        throw new OpenBaoResponseError(
          `OpenBao ${path} failed (${res.status})`
        );
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  private readonly wrapper: DekWrapper = {
    wrap: async (dek: Buffer, keyName: string) => {
      const res = (await this.transitPost(`encrypt/${keyName}`, {
        plaintext: dek.toString("base64"),
      })) as TransitEncryptResponse;
      const ciphertext = res.data?.ciphertext;
      const keyVersion = res.data?.key_version;
      if (!ciphertext || typeof ciphertext !== "string") {
        throw new OpenBaoResponseError(
          "OpenBao encrypt response missing ciphertext"
        );
      }
      if (!Number.isInteger(keyVersion) || (keyVersion as number) <= 0) {
        throw new OpenBaoResponseError(
          "OpenBao encrypt response missing key_version"
        );
      }
      return {
        wrapped: Buffer.from(ciphertext, "utf8"),
        keyVersion: keyVersion as number,
      };
    },
    unwrap: async (wrapped: Buffer, keyName: string) => {
      const res = (await this.transitPost(`decrypt/${keyName}`, {
        ciphertext: wrapped.toString("utf8"),
      })) as TransitDecryptResponse;
      const plaintext = res.data?.plaintext;
      if (!plaintext || typeof plaintext !== "string") {
        throw new OpenBaoResponseError(
          "OpenBao decrypt response missing plaintext"
        );
      }
      const keyVersion =
        (res.data?.key_version as number | undefined) ??
        parseTransitVersion(wrapped.toString("utf8"));
      if (!Number.isInteger(keyVersion) || (keyVersion as number) <= 0) {
        throw new OpenBaoResponseError(
          "OpenBao decrypt response missing key version"
        );
      }
      return {
        dek: Buffer.from(plaintext, "base64"),
        keyVersion: keyVersion as number,
      };
    },
  };

  async encrypt(
    plaintext: Buffer,
    meta: EnvelopeMeta
  ): Promise<{ ciphertext: Buffer }> {
    try {
      const ciphertext = await this.codec.seal(plaintext, meta, this.wrapper);
      return { ciphertext };
    } catch (e) {
      if (e instanceof EnvelopeError || e instanceof OpenBaoResponseError)
        throw e;
      throw new EnvelopeError(`OpenBao encrypt failed: ${String(e)}`);
    }
  }

  async decrypt(
    ciphertext: Buffer,
    meta: EnvelopeMeta
  ): Promise<{ plaintext: Buffer }> {
    try {
      const plaintext = await this.codec.open(ciphertext, meta, this.wrapper);
      return { plaintext };
    } catch (e) {
      if (e instanceof EnvelopeError || e instanceof OpenBaoResponseError)
        throw e;
      throw new EnvelopeError(`OpenBao decrypt failed: ${String(e)}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const scheme = this.cfg.useTls ? "https" : "http";
      const res = await fetch(`${scheme}://${this.cfg.addr}/v1/sys/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
