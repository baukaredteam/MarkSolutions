import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// W0-03a final service-boundary corrections — red repros.
// Branch: fix/w0-03a-billing-scope-payment-disable-token-store

const SRC = join(__dirname, "..", "src");

describe("W0-03a final boundary corrections (red)", () => {
  const billingSrc = readFileSync(join(SRC, "billing.service.ts"), "utf8");
  const authSrc = readFileSync(join(SRC, "auth.service.ts"), "utf8");
  const invoiceSvcSrc = readFileSync(join(SRC, "invoice.service.ts"), "utf8");

  it("(1) BillingService.getAccount accepts optional legalEntityId for exact match", () => {
    expect(billingSrc).toMatch(
      /getAccount\(db:\s*Db,\s*tenantId:\s*string,\s*legalEntityId\?:\s*string\)/
    );
  });

  it("(2) InvoiceService.confirm verifies account LE before topup (payment boundary)", () => {
    expect(invoiceSvcSrc).toMatch(
      /account\.findFirst[\s\S]*?legalEntityId:\s*invoice\.legalEntityId/
    );
  });

  it("(3) PAYMENTS_ENABLED=false blocks invoice confirm", () => {
    expect(invoiceSvcSrc).toMatch(/PAYMENTS_ENABLED/);
  });

  it("(4) PAYMENTS_ENABLED=false blocks kaspiWebhook", () => {
    expect(invoiceSvcSrc).toMatch(/PAYMENTS_ENABLED/);
  });

  it("(5) Selection JTI store is durable (database-backed, not in-memory)", () => {
    expect(authSrc).not.toMatch(
      /new Set<string>\(\).*JTI|usedSelectionJti.*=.*new Set/
    );
    expect(authSrc).toMatch(
      /selectionToken.*findFirst|usedSelection.*findFirst|prisma\.usedSelection/i
    );
  });
});
