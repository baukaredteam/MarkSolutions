import { Injectable, Logger } from "@nestjs/common";
import { StorageAdapter } from "@markflow/shared";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

// W0-03a: MinIO S3-compatible storage adapter.
// Tenant-scoped: every operation requires organizationId + legalEntityId.
// Object keys: {organizationId}/{legalEntityId}/{uuid} — callers cannot choose arbitrary S3 keys.

export interface MinioStorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSsl: boolean;
  timeoutMs: number;
}

@Injectable()
export class MinioStorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private readonly client: S3Client;
  private readonly cfg: MinioStorageConfig;

  constructor(
    cfg: Partial<MinioStorageConfig> &
      Pick<
        MinioStorageConfig,
        "endpoint" | "accessKey" | "secretKey" | "bucket"
      >
  ) {
    this.cfg = { useSsl: false, timeoutMs: 30000, ...cfg };
    this.client = new S3Client({
      endpoint: `${this.cfg.useSsl ? "https" : "http"}://${this.cfg.endpoint}`,
      region: "us-east-1",
      credentials: {
        accessKeyId: this.cfg.accessKey,
        secretAccessKey: this.cfg.secretKey,
      },
      forcePathStyle: true,
      requestHandler: { requestTimeout: this.cfg.timeoutMs },
    });
  }

  async write(
    organizationId: string,
    legalEntityId: string,
    data: Buffer
  ): Promise<string> {
    this.validateScope(organizationId, legalEntityId);
    const key = `${organizationId}/${legalEntityId}/${randomUUID()}`;
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
    this.validateScope(organizationId, legalEntityId);
    this.validateKey(key, organizationId, legalEntityId);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key })
    );
    const bytes = await (response.Body as any).transformToByteArray();
    return Buffer.from(bytes);
  }

  private validateScope(orgId: string, leId: string): void {
    if (!orgId || orgId.trim() === "")
      throw new Error("organizationId required");
    if (!leId || leId.trim() === "") throw new Error("legalEntityId required");
    if (orgId.includes("..") || orgId.includes("/") || orgId.includes("\\"))
      throw new Error(`Invalid organizationId: ${orgId}`);
    if (leId.includes("..") || leId.includes("/") || leId.includes("\\"))
      throw new Error(`Invalid legalEntityId: ${leId}`);
  }

  private validateKey(key: string, orgId: string, leId: string): void {
    if (!key || key.includes("..") || key.includes("\\"))
      throw new Error(`Invalid key: ${key}`);
    const expectedPrefix = `${orgId}/${leId}/`;
    if (!key.startsWith(expectedPrefix))
      throw new Error(`Key must start with ${expectedPrefix}`);
  }
}
