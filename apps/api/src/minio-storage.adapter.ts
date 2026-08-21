import { Injectable, Logger } from "@nestjs/common";
import { StorageAdapter } from "@markflow/shared";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

// W0-03a: MinIO S3-compatible storage adapter.
// Uses AWS SDK S3 client for object storage operations.
// Config: endpoint, credentials, bucket, path-style, timeout, tenant prefix.

export interface MinioStorageConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSsl: boolean;
  timeoutMs: number;
  tenantPrefix: string; // e.g. "markflow-local"
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
      forcePathStyle: true, // MinIO requires path-style
      requestHandler: {
        requestTimeout: this.config.timeoutMs,
      },
    });
  }

  async write(data: Buffer): Promise<string> {
    const key = `${this.config.tenantPrefix}/${randomUUID()}`;
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

  async read(key: string): Promise<Buffer> {
    this.validateKey(key);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      })
    );
    // transformToByteArray is available on the SDK stream type
    const bytes = await (response.Body as any).transformToByteArray();
    return Buffer.from(bytes);
  }

  private validateKey(key: string): void {
    if (
      !key ||
      key.includes("..") ||
      key.includes("\\") ||
      key.startsWith(".")
    ) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    // Tenant prefix validation: key must start with the configured prefix
    if (!key.startsWith(`${this.config.tenantPrefix}/`)) {
      throw new Error(
        `Storage key must start with tenant prefix '${this.config.tenantPrefix}/'`
      );
    }
  }
}
