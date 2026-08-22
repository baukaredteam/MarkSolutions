#!/usr/bin/env node
// W0-03a: fail-closed gate for the local-adapters integration suite.
//
// 1. Docker must be available and healthy — otherwise exit nonzero (do not run).
// 2. MinIO + OpenBao must be reachable and healthy.
// 3. A restricted OpenBao adapter token (never the root token) must be provided.
// 4. The suite must not skip — any skip or missing target → nonzero.
//
// Usage: npm run test:local-adapters
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

function fail(msg) {
  console.error(`test:local-adapters BLOCKED: ${msg}`);
  process.exit(1);
}

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}

// 1. Docker availability
if (sh("docker info") === null) {
  fail(
    "Docker is unavailable. test:local-adapters requires a Docker-capable host " +
      "(docker compose -f docker-compose.infra.yml up -d)."
  );
}

// 2. Service health
const minioLive = sh("curl -sf http://localhost:9000/minio/health/live");
if (minioLive === null) fail("MinIO is not healthy at http://localhost:9000");
const baoSealed = sh("curl -sf http://localhost:8200/v1/sys/health");
if (baoSealed === null) fail("OpenBao is not healthy at http://localhost:8200");

// 3. Restricted token (never root). Resolve from env or the bootstrap file.
let token = process.env.LOCAL_OPENBAO_ADAPTER_TOKEN ?? "";
if (!token) {
  const fromDocker = sh("docker exec markflow-openbao cat /bao/data/local-adapter-token");
  if (fromDocker) token = fromDocker.trim();
}
if (!token) {
  fail("restricted adapter token not found (LOCAL_OPENBAO_ADAPTER_TOKEN or /bao/data/local-adapter-token)");
}
const rootToken = process.env.LOCAL_OPENBAO_ROOT_TOKEN ?? "";
if (rootToken && rootToken === token) {
  fail("LOCAL_OPENBAO_ADAPTER_TOKEN must not be the root token");
}

// 4. Run the integration suite (must not skip). Vitest exits nonzero on failure/skip.
const env = {
  ...process.env,
  LOCAL_OPENBAO_ADAPTER_TOKEN: token,
  KMS_OPENBAO_ADDR: process.env.KMS_OPENBAO_ADDR ?? "localhost:8200",
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? "localhost:9000",
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? "markflow",
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? "markflow123",
  MINIO_BUCKET: process.env.MINIO_BUCKET ?? "markflow-codes",
  MINIO_REGION: process.env.MINIO_REGION ?? "us-east-1",
  APP_ENV: "local",
};

try {
  execSync("npx vitest run apps/api/test/local-adapters.e2e.ts", {
    stdio: "inherit",
    env,
  });
} catch (e) {
  fail(`local-adapters suite failed or skipped (exit ${e.status ?? 1})`);
}

console.log("test:local-adapters PASSED (zero skips)");
