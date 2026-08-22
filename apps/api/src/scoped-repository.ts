import { ScopeError } from "./scope";
import { ForbiddenException } from "@nestjs/common";

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

/** Extract the guard-validated scope from a request; 403 when absent.
 *  No operator bypass: customer data always requires an active legal entity. */
export function activeScopeOf(req: unknown): {
  organizationId: string;
  legalEntityId: string;
} {
  const scope = (req as { activeScope?: unknown }).activeScope;
  if (
    !scope ||
    typeof scope !== "object" ||
    !(scope as { organizationId?: string }).organizationId ||
    !(scope as { legalEntityId?: string }).legalEntityId
  ) {
    throw new ForbiddenException("active legal entity required");
  }
  return requireScope(
    scope as { organizationId: string; legalEntityId: string }
  );
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
