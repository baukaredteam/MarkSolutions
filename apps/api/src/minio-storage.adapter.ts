import { Injectable, Logger } from "@nestjs/common";
import { StorageAdapter } from "@markflow/shared";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import type { Agent } from "node:https";
import { randomUUID } from "node:crypto";
import type { MinioConfig } from "./config-validation";
import { legalEntityScope } from "./scope";

// W0-03a: MinIO S3-compatible storage adapter (ADR-026).
// Tenant + legal-entity scoped: every operation requires organizationId and
// legalEntityId. Object keys: {organizationId}/{legalEntityId}/{uuid} — callers
// cannot choose arbitrary S3 keys.

@Injectable()
export class MinioStorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private readonly client: S3Client;
  private readonly cfg: MinioConfig;

  constructor(cfg: MinioConfig) {
    this.cfg = cfg;
    let agent: Agent | undefined;
    if (cfg.useTls && cfg.ca) {
      const https = require("node:https") as typeof import("node:https");
      agent = new https.Agent({ ca: cfg.ca });
    }
    this.client = new S3Client({
      endpoint: `${cfg.useTls ? "https" : "http"}://${cfg.endpoint}`,
      region: cfg.region || "us-east-1",
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
      forcePathStyle: true,
      requestHandler: {
        requestTimeout: cfg.timeoutMs,
        connectionTimeout: cfg.timeoutMs,
        ...(agent ? { httpsAgent: agent } : {}),
      },
    });
  }

  async write(
    organizationId: string,
    legalEntityId: string,
    data: Buffer
  ): Promise<string> {
    const scope = legalEntityScope(organizationId, legalEntityId);
    const key = `${scope.organizationId}/${scope.legalEntityId}/${randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: data,
        ContentType: "application/octet-stream",
      })
    );
    return key;
  }

  async read(
    organizationId: string,
    legalEntityId: string,
    key: string
  ): Promise<Buffer> {
    const scope = legalEntityScope(organizationId, legalEntityId);
    this.validateKey(key, scope.organizationId, scope.legalEntityId);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key })
    );
    const bytes = await (
      response.Body as { transformToByteArray(): Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.cfg.bucket })
      );
      return true;
    } catch {
      return false;
    }
  }

  private validateKey(key: string, orgId: string, leId: string): void {
    if (!key || key.includes("..") || key.includes("\\")) {
      throw new Error(`invalid storage key: ${key}`);
    }
    const expectedPrefix = `${orgId}/${leId}/`;
    if (!key.startsWith(expectedPrefix)) {
      throw new Error(`key must start with ${expectedPrefix}`);
    }
  }
}
