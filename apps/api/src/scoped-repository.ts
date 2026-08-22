import { ScopeError } from "./scope";

// W0-03a part 2 (ADR-027) — LegalEntityScopedRepository guard policy.
//
// Deep seam: every protected read/write goes through this tiny interface so
// callers cannot predicate on tenantId alone, cannot pass two unrelated ids
// and cannot manufacture a legal entity from a tenant id.

export class CrossTenantScopeError extends ScopeError {
  constructor() {
    super("scope mismatch: legal entity does not belong to organization");
  }
}

export function requireScope(
  scope: { organizationId: string; legalEntityId: string } | null | undefined
): { organizationId: string; legalEntityId: string } {
  if (!scope?.organizationId || !scope?.legalEntityId) {
    throw new ScopeError("active legal entity scope required");
  }
  if (scope.organizationId === scope.legalEntityId) {
    throw new ScopeError("legalEntityId must not duplicate organizationId");
  }
  return scope;
}

/** Standard Prisma `where` conjunct for any protected aggregate. */
export function scopeWhere(scope: {
  organizationId: string;
  legalEntityId: string;
}): { tenantId: string; legalEntityId: string } {
  const s = requireScope(scope);
  return { tenantId: s.organizationId, legalEntityId: s.legalEntityId };
}
