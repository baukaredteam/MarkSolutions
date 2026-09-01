#!/usr/bin/env node
/**
 * Read-only ИС МПТ GET /api/utilisation/<reportId> healthcheck.
 *
 * Agents/CI MUST NOT invoke this against test.markirovka.kz, prod.markirovka.kz,
 * or any markirovka host. Local tests use a 127.0.0.1 mock HTTP server.
 * A human on the VPS may run this against STAGE after sourcing
 * ~/.config/marksolutions/mpt.env (see docs/STAGE-MPT-READONLY-GET.md).
 *
 * Requires MPT_PROBE_REPORT_ID (existing STAGE report — do not POST utilisation).
 * Auth then GET /api/utilisation/<id> (HttpMptAdapter.getUtilisation).
 *
 * Stdout: status=<http> | status=network | missing env.
 * Optional second line if HTTP 200 and JSON has a status field:
 *   report_status=<IN_PROCESS|SUCCESS|ERROR|other>
 * Never prints rejectReason, tokens, password, or full KM.
 */
import {
  authThenGet,
  loadOptionalEnvFile,
  requiredAuthEnv,
  writeMissingEnv,
  writeStatus,
} from "./lib/mpt-auth-env.mjs";

const CONTRACT_REPORT_STATUSES = new Set([
  "IN_PROCESS",
  "SUCCESS",
  "ERROR",
]);

loadOptionalEnvFile();
const reportId = process.env.MPT_PROBE_REPORT_ID?.trim();
if (!requiredAuthEnv() || !reportId) {
  writeMissingEnv();
  process.exit(1);
}

const result = await authThenGet(
  `/api/utilisation/${encodeURIComponent(reportId)}`
);
writeStatus(result.status);
if (
  result.status === 200 &&
  result.json &&
  typeof result.json === "object" &&
  typeof /** @type {{ status?: unknown }} */ (result.json).status === "string"
) {
  const raw = /** @type {{ status: string }} */ (result.json).status;
  const label = CONTRACT_REPORT_STATUSES.has(raw) ? raw : "other";
  process.stdout.write(`report_status=${label}\n`);
}
process.exit(result.status === 200 ? 0 : 1);
