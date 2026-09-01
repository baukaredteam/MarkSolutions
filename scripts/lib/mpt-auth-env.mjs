/**
 * Shared env + authenticate helpers for ИС МПТ VPS healthchecks.
 *
 * Agents/CI MUST NOT invoke callers against test.markirovka.kz,
 * prod.markirovka.kz, or any markirovka host. Local tests use 127.0.0.1.
 * Humans on the VPS may source ~/.config/marksolutions/mpt.env.
 *
 * Never log login, password, tokens, or full KM.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const ENV_FILE = join(homedir(), ".config/marksolutions/mpt.env");
export const TIMEOUT_MS = 15_000;
export const AUTH_PATH = "/api/users/authenticate";

export function loadOptionalEnvFile(path = ENV_FILE) {
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
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

export function requiredAuthEnv() {
  const base = process.env.MPT_BASE_URL;
  const login = process.env.MPT_LOGIN;
  const password = process.env.MPT_PASSWORD;
  if (!base || !login || !password) return null;
  return { base: base.replace(/\/+$/, ""), login, password };
}

export function writeMissingEnv() {
  process.stdout.write("missing env\n");
}

export function writeStatus(status) {
  process.stdout.write(`status=${status}\n`);
}

export async function fetchWithTimeout(url, init, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function readJsonQuiet(res) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * POST /api/users/authenticate (CONTRACT, Accept * /*).
 * @returns {{ kind: "network" } | { kind: "http", status: number, accessToken: string | null }}
 */
export async function authenticate(auth) {
  try {
    const res = await fetchWithTimeout(`${auth.base}${AUTH_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
      },
      body: JSON.stringify({ login: auth.login, password: auth.password }),
    });
    const data = await readJsonQuiet(res);
    const accessToken =
      data &&
      typeof data === "object" &&
      typeof /** @type {{ accessToken?: unknown }} */ (data).accessToken ===
        "string"
        ? /** @type {{ accessToken: string }} */ (data).accessToken
        : null;
    return { kind: "http", status: res.status, accessToken };
  } catch {
    return { kind: "network" };
  }
}

/**
 * Authenticate then one GET. Prints status= from the last HTTP (or network).
 * @returns {Promise<{ status: number, json: unknown } | null>} null if already exited via process
 */
export async function authThenGet(path) {
  loadOptionalEnvFile();
  const auth = requiredAuthEnv();
  if (!auth) {
    writeMissingEnv();
    process.exit(1);
  }

  const authResult = await authenticate(auth);
  if (authResult.kind === "network") {
    writeStatus("network");
    process.exit(1);
  }
  if (authResult.status !== 200) {
    writeStatus(authResult.status);
    process.exit(1);
  }

  const headers = { Accept: "*/*" };
  if (authResult.accessToken) {
    headers.Authorization = `Bearer ${authResult.accessToken}`;
  }

  try {
    const res = await fetchWithTimeout(`${auth.base}${path}`, {
      method: "GET",
      headers,
    });
    const json = await readJsonQuiet(res);
    return { status: res.status, json };
  } catch {
    writeStatus("network");
    process.exit(1);
  }
}
