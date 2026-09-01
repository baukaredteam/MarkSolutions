#!/usr/bin/env node
/**
 * Read-only ИС МПТ GET /api/orders healthcheck.
 *
 * Agents/CI MUST NOT invoke this against test.markirovka.kz, prod.markirovka.kz,
 * or any markirovka host. Local tests use a 127.0.0.1 mock HTTP server.
 * A human on the VPS may run this against STAGE after sourcing
 * ~/.config/marksolutions/mpt.env (see docs/STAGE-MPT-READONLY-GET.md).
 *
 * Auth then one GET. Always sends documented query productGroup
 * (MPT_PRODUCT_GROUP after loading mpt.env; default motor-oils).
 * If MPT_PROBE_ORDER_ID is set → also orderId= (official list filter).
 * No invented cursor/limit. No POST orders / utilisation / doc/*.
 *
 * Stdout: status=<http> | status=network | missing env.
 * Optional second line if HTTP 200 and JSON has an orderInfos array:
 *   orders_count=<n>
 * Never prints order bodies, tokens, password, or full KM.
 */
import {
  authThenGet,
  loadOptionalEnvFile,
  writeStatus,
} from "./lib/mpt-auth-env.mjs";

/** Same default as HttpMptAdapter / .env.example. */
const DEFAULT_PRODUCT_GROUP = "motor-oils";

loadOptionalEnvFile();
const productGroup =
  process.env.MPT_PRODUCT_GROUP?.trim() || DEFAULT_PRODUCT_GROUP;
const params = new URLSearchParams({ productGroup });
const orderId = process.env.MPT_PROBE_ORDER_ID?.trim();
if (orderId) params.set("orderId", orderId);
const path = `/api/orders?${params.toString()}`;

const result = await authThenGet(path);
writeStatus(result.status);
if (
  result.status === 200 &&
  result.json &&
  typeof result.json === "object" &&
  Array.isArray(
    /** @type {{ orderInfos?: unknown }} */ (result.json).orderInfos
  )
) {
  const n = /** @type {{ orderInfos: unknown[] }} */ (result.json).orderInfos
    .length;
  process.stdout.write(`orders_count=${n}\n`);
}
process.exit(result.status === 200 ? 0 : 1);
