import { describe, it, expect } from "vitest";
import { legalEntityScope, assertScope, ScopeError } from "./scope";

describe("LegalEntityScope", () => {
  it("builds a valid scope from distinct ids", () => {
    const s = legalEntityScope("org-1", "le-1");
    expect(s.organizationId).toBe("org-1");
    expect(s.legalEntityId).toBe("le-1");
  });

  it("rejects duplicated organizationId/legalEntityId (tenantId copied twice)", () => {
    expect(() => legalEntityScope("same-id", "same-id")).toThrow(ScopeError);
  });

  it("rejects empty scope segments", () => {
    expect(() => legalEntityScope("", "le-1")).toThrow(ScopeError);
    expect(() => legalEntityScope("org-1", "")).toThrow(ScopeError);
  });

  it("rejects path/scope-injection characters", () => {
    expect(() => legalEntityScope("org/1", "le-1")).toThrow(ScopeError);
    expect(() => legalEntityScope("org-1", "..")).toThrow(ScopeError);
    expect(() => legalEntityScope("org-1", "le 1")).toThrow(ScopeError);
  });

  it("assertScope re-validates an existing scope", () => {
    expect(() =>
      assertScope({ organizationId: "org-1", legalEntityId: "le-1" })
    ).not.toThrow();
    expect(() =>
      assertScope({ organizationId: "x", legalEntityId: "x" })
    ).toThrow(ScopeError);
  });
});
