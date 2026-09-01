#!/usr/bin/env node
/**
 * Read-only ИС МПТ GET /api/orders healthcheck.
 *
 * Agents/CI MUST NOT invoke this against test.markirovka.kz, prod.markirovka.kz,
 * or any markirovka host. Local tests use a 127.0.0.1 mock HTTP server.
 * A human on the VPS may run this against STAGE after sourcing
 * ~/.config/marksolutions/mpt.env (see docs/STAGE-MPT-READONLY-GET.md).
 *
 * Auth then one GET. If MPT_PROBE_ORDER_ID is set → GET /api/orders?orderId=
 * (HttpMptAdapter.getOrder). Else GET /api/orders (CONTRACT list; no invented
 * cursor/limit). No POST orders / utilisation / doc/*.
 *
 * Stdout: status=<http> | status=network | missing env.
 * Never prints response body, tokens, password, or full KM.
 */
import {
  authThenGet,
  loadOptionalEnvFile,
  writeStatus,
} from "./lib/mpt-auth-env.mjs";

loadOptionalEnvFile();
const orderId = process.env.MPT_PROBE_ORDER_ID;
const path =
  orderId && orderId.trim()
    ? `/api/orders?orderId=${encodeURIComponent(orderId.trim())}`
    : "/api/orders";

const result = await authThenGet(path);
writeStatus(result.status);
process.exit(result.status === 200 ? 0 : 1);
