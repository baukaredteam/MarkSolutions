#!/usr/bin/env node
/**
 * Read-only ИС МПТ authenticate healthcheck.
 *
 * Agents/CI MUST NOT invoke this against test.markirovka.kz, prod.markirovka.kz,
 * or any markirovka host. Local tests use a 127.0.0.1 mock HTTP server.
 * A human on the VPS may run this against STAGE after sourcing
 * ~/.config/marksolutions/mpt.env (see docs/STAGE-MPT-HEALTHCHECK.md).
 *
 * Auth only: POST /api/users/authenticate (CONTRACT-IS-MPT).
 * No GET /api/codes, utilisation, refresh, doc/*, or other MPT paths.
 *
 * Stdout is a single line: status=<http> | status=network | missing env.
 * Never prints response body, tokens, password, or full KM.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_FILE = join(homedir(), ".config/marksolutions/mpt.env");
const TIMEOUT_MS = 15_000;
const AUTH_PATH = "/api/users/authenticate";

function loadOptionalEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] !== undefined) continue; // process env wins if already set
    process.env[key] = value;
  }
}

function requiredEnv() {
  const base = process.env.MPT_BASE_URL;
  const login = process.env.MPT_LOGIN;
  const password = process.env.MPT_PASSWORD;
  if (!base || !login || !password) {
    process.stdout.write("missing env\n");
    process.exit(1);
  }
  return { base: base.replace(/\/+$/, ""), login, password };
}

async function main() {
  loadOptionalEnvFile(ENV_FILE);
  const { base, login, password } = requiredEnv();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${AUTH_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
      },
      body: JSON.stringify({ login, password }),
      signal: controller.signal,
    });
    await res.arrayBuffer().catch(() => {});
    process.stdout.write(`status=${res.status}\n`);
    process.exit(res.status === 200 ? 0 : 1);
  } catch {
    process.stdout.write("status=network\n");
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

await main();
