#!/usr/bin/env node
// W0-03a pt2 (ADR-027): fail-closed gate for the local-adapters suite.
//
// Consumes ONLY a restricted adapter token minted by scripts/local-stack-up.ps1
// (or minted here in-memory from the gitignored .env.local root token — the
// root token never leaves this process and is never written anywhere).
// Fails nonzero when Docker/stack is unavailable, unhealthy, misconfigured,
// or when any target test skips.
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

function fail(msg) {
  console.error(`test:local-adapters BLOCKED: ${msg}`);
  process.exit(1);
}
function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch {
    return null;
  }
}

if (!existsSync("compose.local.yml")) {
  fail("compose.local.yml not found — PowerShell local stack artifacts missing");
}
if (sh("docker info") === null) {
  fail("Docker unavailable. Run scripts/local-stack-up.ps1 on a Docker-capable host.");
}
for (const [name, url] of [
  ["MinIO", "http://127.0.0.1:9000/minio/health/live"],
  ["OpenBao", "http://127.0.0.1:8200/v1/sys/health"],
]) {
  if (sh(`curl -sf ${url}`) === null) fail(`${name} is not healthy at ${url}`);
}

// Restricted token: env first; otherwise mint ephemeral (root stays in memory).
let token = process.env.LOCAL_OPENBAO_ADAPTER_TOKEN ?? "";
const envLocal = existsSync(".env.local")
  ? readFileSync(".env.local", "utf8")
  : "";
const rootFromEnv = /LOCAL_OPENBAO_ROOT_TOKEN=(\S+)/.exec(envLocal)?.[1] ?? "";
if (token && rootFromEnv && token === rootFromEnv) {
  fail("LOCAL_OPENBAO_ADAPTER_TOKEN must not be the root token");
}
if (!token) {
  if (!rootFromEnv) {
    fail("no restricted token and no LOCAL_OPENBAO_ROOT_TOKEN in .env.local — run local-stack-up.ps1");
  }
  const json = sh(
    `docker exec -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN=${rootFromEnv} markflow-local-openbao bao token create -policy=markflow-local-adapter -ttl=30m -format=json`
  );
  if (json === null) fail("could not mint restricted adapter token via docker exec");
  const m = /"token"\s*:\s*"([^"]+)"/.exec(json);
  if (!m) fail("restricted token missing in bao output");
  if (m[1] === rootFromEnv) fail("minted token equals root token");
  token = m[1];
}

const minioAccess =
  process.env.MINIO_ACCESS_KEY ?? /LOCAL_MINIO_ACCESS_KEY=(\S+)/.exec(envLocal)?.[1] ?? "";
const minioSecret =
  process.env.MINIO_SECRET_KEY ?? /LOCAL_MINIO_SECRET_KEY=(\S+)/.exec(envLocal)?.[1] ?? "";
if (!minioAccess || !minioSecret) fail("MinIO credentials not found (.env.local or env)");

if ((process.env.MPT_WRITE_ENABLED ?? "").toLowerCase() === "true") {
  fail("MPT_WRITE_ENABLED must stay false in the local-adapter test path");
}

try {
  execSync(
    "npx vitest run apps/api/test/local-adapters.e2e.ts",
    {
      stdio: "inherit",
      env: {
        ...process.env,
        LOCAL_OPENBAO_ADAPTER_TOKEN: token,
        APP_ENV: "local",
        KMS_PROFILE: "openbao",
        KMS_OPENBAO_ADDR: process.env.KMS_OPENBAO_ADDR ?? "127.0.0.1:8200",
        MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? "127.0.0.1:9000",
        MINIO_ACCESS_KEY: minioAccess,
        MINIO_SECRET_KEY: minioSecret,
        MINIO_BUCKET: process.env.MINIO_BUCKET ?? "markflow-local",
        MINIO_REGION: process.env.MINIO_REGION ?? "us-east-1",
      },
    }
  );
} catch (e) {
  fail(`local-adapters suite failed or skipped (exit ${e.status ?? 1})`);
}
console.log("test:local-adapters PASSED (zero skips)");
