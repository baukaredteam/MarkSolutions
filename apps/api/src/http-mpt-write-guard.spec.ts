import { describe, it, expect } from "vitest";
import { HttpMptAdapter } from "./http-mpt.adapter";
import { createMptWritePolicy, WriteDisabledError } from "./mpt-write-policy";
import { buildAppConfig } from "./config-validation";

// W0-03a: MptWritePolicy defense-in-depth. Proves that with MPT_WRITE_ENABLED
// false, every business-write method throws BEFORE any network I/O (fetch is
// never called). Auth/refresh POST is transport, not a business write.

function disabledAdapter() {
  const cfg = buildAppConfig({ APP_ENV: "test", JWT_SECRET: "dev-secret" });
  const policy = createMptWritePolicy({ mptWriteEnabled: false });
  const adapter = new HttpMptAdapter(cfg, undefined as never, policy);
  const calls: string[] = [];
  adapter.setFetch(async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({}), { status: 200 });
  });
  return { adapter, calls };
}

describe("HttpMptAdapter — write guard (MPT_WRITE_ENABLED=false)", () => {
  it("createOrder performs zero network calls", async () => {
    const { adapter, calls } = disabledAdapter();
    await expect(
      adapter.createOrder({
        orderId: "o1",
        tenantId: "t1",
        gtin: "04014835723399",
        quantity: 1,
        serialNumberType: "OPERATOR",
        cisType: "UNIT",
        isPaid: true,
      })
    ).rejects.toThrow(WriteDisabledError);
    expect(calls.length).toBe(0);
  });

  it("submitUtilisation performs zero network calls", async () => {
    const { adapter, calls } = disabledAdapter();
    await expect(
      adapter.submitUtilisation({
        tenantId: "t1",
        sntins: ["0000001"],
        businessPlaceId: 1,
        releaseType: "PRODUCTION",
        expirationDate: "2026-12-31",
        productionDate: "2026-01-01",
        manufacturerCountry: "KZ",
      })
    ).rejects.toThrow(WriteDisabledError);
    expect(calls.length).toBe(0);
  });

  it("submitImport performs zero network calls", async () => {
    const { adapter, calls } = disabledAdapter();
    await expect(
      adapter.submitImport({
        tenantId: "t1",
        codes: ["code-1"],
        customsDate: "2026-01-01",
        customsNumber: "12345678",
      })
    ).rejects.toThrow(WriteDisabledError);
    expect(calls.length).toBe(0);
  });

  it("submitWithdrawal performs zero network calls", async () => {
    const { adapter, calls } = disabledAdapter();
    await expect(
      adapter.submitWithdrawal({
        tenantId: "t1",
        codes: ["code-1"],
        withdrawalType: "WITHDRAWAL",
        withdrawalReason: "RETURN_SUPPLIER",
        childrenWriteOff: false,
      })
    ).rejects.toThrow(WriteDisabledError);
    expect(calls.length).toBe(0);
  });
});
