import { describe, it, expect } from "vitest";
import { MockEcomAdapter } from "./ecom.adapter";

describe("MockEcomAdapter (ADR-004)", () => {
  it("verify returns Pending External on first call, then VERIFIED after retry", async () => {
    const adapter = new MockEcomAdapter();
    const first = await adapter.verify("123456789012");
    expect(first.status).toBe("PENDING_EXTERNAL");

    const second = await adapter.verify("123456789012");
    expect(second.status).toBe("VERIFIED");
  });

  it("manual mode: operator decision resolves the pending check", async () => {
    const adapter = new MockEcomAdapter();
    await adapter.verify("555666777888");
    expect(adapter.resolve("555666777888", "approve")).toBe(true);
    const after = await adapter.verify("555666777888");
    expect(after.status).toBe("VERIFIED");
  });
});
