import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// W0-03a final corrections — red repros for:
// (1) Token JTI create swallows P2002 → race/replay can slip through
// (2) BillingService topup doesn't pass legalEntityId to getAccount

const SRC = join(__dirname, "..", "src");

describe("W0-03a billing dual-scope + token atomicity (red)", () => {
  const authSrc = readFileSync(join(SRC, "auth.service.ts"), "utf8");
  const billingSrc = readFileSync(join(SRC, "billing.service.ts"), "utf8");

  it("(1) JTI create does NOT swallow errors — P2002 propagates as replay", () => {
    expect(authSrc).not.toMatch(/\.catch\(\(\)\s*=>\s*\{\s*\}\)/);
    expect(authSrc).toMatch(/P2002|already used/);
  });

  it("(2) BillingService topup accepts optional legalEntityId", () => {
    expect(billingSrc).toMatch(
      /async topup\(\s*tenantId:\s*string,\s*legalEntityId(?:\?\s*:\s*string)?\s*,/
    );
  });

  it("(3) BillingService apply passes legalEntityId to getAccount", () => {
    expect(billingSrc).toMatch(
      /getAccount\(db,\s*tenantId,\s*.*legalEntityId/i
    );
  });
});
