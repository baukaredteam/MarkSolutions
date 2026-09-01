#!/usr/bin/env node
/**
 * Read-only ИС МПТ GET /api/codes healthcheck.
 *
 * Agents/CI MUST NOT invoke this against test.markirovka.kz, prod.markirovka.kz,
 * or any markirovka host. Local tests use a 127.0.0.1 mock HTTP server.
 * A human on the VPS may run this against STAGE after sourcing
 * ~/.config/marksolutions/mpt.env (see docs/STAGE-MPT-READONLY-GET.md).
 *
 * Requires MPT_PROBE_ORDER_ID, MPT_PROBE_GTIN, MPT_PROBE_QUANTITY
 * (READY/CLOSED STAGE order). Auth then
 * GET /api/codes?orderId=&gtin=&quantity= (HttpMptAdapter.getCodes). No POST.
 *
 * Stdout: status=<http> | status=network | missing env.
 * Optional second line if HTTP 200 and JSON has a codes array:
 *   codes_count=<n>
 * Never prints code values, tokens, password, or full KM.
 */
import {
  authThenGet,
  loadOptionalEnvFile,
  requiredAuthEnv,
  writeMissingEnv,
  writeStatus,
} from "./lib/mpt-auth-env.mjs";

loadOptionalEnvFile();
const orderId = process.env.MPT_PROBE_ORDER_ID?.trim();
const gtin = process.env.MPT_PROBE_GTIN?.trim();
const quantity = process.env.MPT_PROBE_QUANTITY?.trim();
if (!requiredAuthEnv() || !orderId || !gtin || !quantity) {
  writeMissingEnv();
  process.exit(1);
}

const q = new URLSearchParams({ orderId, gtin, quantity });
const result = await authThenGet(`/api/codes?${q.toString()}`);
writeStatus(result.status);
if (
  result.status === 200 &&
  result.json &&
  typeof result.json === "object" &&
  Array.isArray(/** @type {{ codes?: unknown }} */ (result.json).codes)
) {
  const n = /** @type {{ codes: unknown[] }} */ (result.json).codes.length;
  process.stdout.write(`codes_count=${n}\n`);
}
process.exit(result.status === 200 ? 0 : 1);
