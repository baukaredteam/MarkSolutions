import { Injectable, Logger } from "@nestjs/common";
import { StorageAdapter } from "@markflow/shared";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

// W0-03a: MinIO S3-compatible storage adapter.
// Tenant-scoped: write/read require validated tenantId.
// Object keys: {tenantId}/{server-uuid} — callers cannot choose arbitrary S3 keys.

export interface MinioStorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSsl: boolean;
  timeoutMs: number;
  tenantPrefix: string;
}

@Injectable()
export class MinioStorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private readonly client: S3Client;
  private readonly config: MinioStorageConfig;

  constructor(
    config: Partial<MinioStorageConfig> &
      Pick<
        MinioStorageConfig,
        "endpoint" | "accessKey" | "secretKey" | "bucket"
      >
  ) {
    this.config = {
      useSsl: false,
      timeoutMs: 30000,
      tenantPrefix: "markflow-local",
      ...config,
    };
    this.client = new S3Client({
      endpoint: `${this.config.useSsl ? "https" : "http"}://${this.config.endpoint}`,
      region: "us-east-1",
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: true,
      requestHandler: { requestTimeout: this.config.timeoutMs },
    });
  }

  async write(tenantId: string, data: Buffer): Promise<string> {
    this.validateTenantId(tenantId);
    const key = `${tenantId}/${randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: data,
        ContentType: "application/octet-stream",
      })
    );
    return key;
  }

  async read(tenantId: string, key: string): Promise<Buffer> {
    this.validateTenantId(tenantId);
    this.validateKey(key, tenantId);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key })
    );
    const bytes = await (response.Body as any).transformToByteArray();
    return Buffer.from(bytes);
  }

  private validateTenantId(tenantId: string): void {
    if (!tenantId || typeof tenantId !== "string" || tenantId.trim() === "") {
      throw new Error("Tenant ID is required and must be non-empty");
    }
    if (
      tenantId.includes("..") ||
      tenantId.includes("/") ||
      tenantId.includes("\\")
    ) {
      throw new Error(`Invalid tenant ID: ${tenantId}`);
    }
  }

  private validateKey(key: string, tenantId: string): void {
    if (!key || key.includes("..") || key.includes("\\")) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    if (!key.startsWith(`${tenantId}/`)) {
      throw new Error(`Storage key must belong to tenant '${tenantId}'`);
    }
  }
}
