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

/** Path + query only. Never host, never Authorization. */
export function writeSafePath(pathAndQuery) {
  process.stdout.write(`path=${pathAndQuery}\n`);
}

const ERROR_MAX = 160;

function looksLikeSecret(text) {
  if (/eyJ/.test(text)) return true;
  if (/accessToken/i.test(text)) return true;
  if (/refreshToken/i.test(text)) return true;
  if (/Bearer /i.test(text)) return true;
  if (/\x1d/.test(text)) return true;
  if (/01\d{14}21[A-Za-z0-9]{6,}/.test(text)) return true;
  if (/[0-9A-Za-z]{28,}/.test(text) && /\d{10,}/.test(text)) return true;
  return false;
}

function asShortString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function formatFieldErrors(arr) {
  const parts = [];
  for (const item of arr) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) parts.push(s);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const field = asShortString(item.field);
    const msg =
      asShortString(item.errorMessage) || asShortString(item.message);
    if (field && msg) parts.push(`${field}:${msg}`);
    else if (msg) parts.push(msg);
    else if (field) parts.push(field);
  }
  return parts.join("; ");
}

function extractFromErrorObject(err) {
  if (!err || typeof err !== "object") return "";
  if (Array.isArray(err)) return formatFieldErrors(err);
  return (
    asShortString(err.message) ||
    asShortString(err.errorMessage) ||
    asShortString(err.description)
  );
}

/**
 * One-line STAGE/xTrace error excerpt. Never raw JSON, tokens, Bearer, or KM.
 * Digs string fields and common nested shapes (error object, errors[], RFC7807).
 * @returns {string | null} sanitized text, "redacted", or null if nothing to print
 */
export function sanitizeMptError(json) {
  if (!json || typeof json !== "object") return null;

  let extracted = "";

  if (Array.isArray(json)) {
    extracted = formatFieldErrors(json);
  }

  if (!extracted && Array.isArray(json.globalErrors) && json.globalErrors.length) {
    extracted = formatFieldErrors(json.globalErrors);
  }

  if (!extracted && "error" in json) {
    const v = json.error;
    if (typeof v === "string" && v.trim()) extracted = v.trim();
    else if (v && typeof v === "object") extracted = extractFromErrorObject(v);
  }

  if (!extracted) {
    for (const key of ["message", "error_message", "description"]) {
      const v = json[key];
      if (typeof v === "string" && v.trim()) {
        extracted = v.trim();
        break;
      }
      if (Array.isArray(v) && v.length) {
        extracted = formatFieldErrors(v);
        if (extracted) break;
      }
    }
  }

  if (!extracted && Array.isArray(json.errors) && json.errors.length) {
    extracted = formatFieldErrors(json.errors);
  }

  if (!extracted) {
    const code = asShortString(json.errorCode);
    const msg = asShortString(json.errorMessage);
    if (code && msg) extracted = `${code}:${msg}`;
    else extracted = msg || code;
  }

  if (!extracted) {
    const title = asShortString(json.title);
    const detail = asShortString(json.detail);
    if (title && detail) extracted = `${title}: ${detail}`;
    else extracted = detail || title;
  }

  if (!extracted) return null;

  extracted = extracted.replace(/[\r\n]+/g, " ").trim();
  if (extracted.length > ERROR_MAX) extracted = extracted.slice(0, ERROR_MAX);

  if (looksLikeSecret(extracted)) return "redacted";
  return extracted;
}

export function writeSafeError(json) {
  const sanitized = sanitizeMptError(json);
  if (sanitized == null) return;
  process.stdout.write(`error=${sanitized}\n`);
}

/** Response Content-Type type only (no charset/params), or `none`. */
export function mimeFromContentType(header) {
  if (!header || typeof header !== "string") return "none";
  const mime = header.split(";")[0].trim();
  return mime || "none";
}

/**
 * Read GET body once. Never returns the raw text to callers (so scripts
 * cannot accidentally print it).
 * @returns {Promise<{ json: unknown, bodyLen: number, contentType: string, parse: "empty" | "json" | "non_json" }>}
 */
export async function readGetBody(res) {
  const text = await res.text().catch(() => "");
  const bodyLen = Buffer.byteLength(text);
  const contentType = mimeFromContentType(res.headers.get("content-type"));
  if (!text) {
    return { json: null, bodyLen, contentType, parse: "empty" };
  }
  try {
    return { json: JSON.parse(text), bodyLen, contentType, parse: "json" };
  } catch {
    return { json: null, bodyLen, contentType, parse: "non_json" };
  }
}

/**
 * Safe 400+ diagnostics: body_len, content_type, and one error= line.
 * Never dumps the body.
 */
export function writeSafeHttpError(result) {
  process.stdout.write(`body_len=${result.bodyLen}\n`);
  process.stdout.write(`content_type=${result.contentType}\n`);
  if (result.parse === "empty") {
    process.stdout.write("error=empty_body\n");
    return;
  }
  if (result.parse === "non_json") {
    process.stdout.write("error=non_json\n");
    return;
  }
  writeSafeError(result.json);
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
 * GET sends Accept * /* and Content-Type application/json (official table).
 * @returns {Promise<{ status: number, json: unknown, bodyLen: number, contentType: string, parse: "empty" | "json" | "non_json" } | null>}
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

  const headers = {
    Accept: "*/*",
    "Content-Type": "application/json",
  };
  if (authResult.accessToken) {
    headers.Authorization = `Bearer ${authResult.accessToken}`;
  }

  try {
    const res = await fetchWithTimeout(`${auth.base}${path}`, {
      method: "GET",
      headers,
    });
    const body = await readGetBody(res);
    return { status: res.status, ...body };
  } catch {
    writeStatus("network");
    process.exit(1);
  }
}
