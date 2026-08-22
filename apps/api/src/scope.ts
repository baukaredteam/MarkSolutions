// W0-03a — LegalEntityScope: the dual authorization boundary below tenant.
//
// Every protected operation (DB query, storage read/write, KMS op, file/vault/
// label op) is scoped by BOTH organizationId (= tenantId) and legalEntityId.
// The two are never duplicated into each other. This module owns the value
// object and the validation, so scope enforcement lives in one place.

export interface LegalEntityScope {
  organizationId: string;
  legalEntityId: string;
}

export class ScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

function assertSegment(name: string, value: string): void {
  if (!value || value.trim() === "")
    throw new ScopeError(`${name} is required`);
  if (!SEGMENT_RE.test(value)) {
    throw new ScopeError(`${name} contains invalid characters: ${value}`);
  }
}

export function legalEntityScope(
  organizationId: string,
  legalEntityId: string
): LegalEntityScope {
  assertSegment("organizationId", organizationId);
  assertSegment("legalEntityId", legalEntityId);
  if (organizationId === legalEntityId) {
    throw new ScopeError(
      "organizationId and legalEntityId must not be duplicated"
    );
  }
  return { organizationId, legalEntityId };
}

/** Validate a scope already in hand (e.g. from the request context). */
export function assertScope(scope: LegalEntityScope): void {
  assertSegment("organizationId", scope.organizationId);
  assertSegment("legalEntityId", scope.legalEntityId);
  if (scope.organizationId === scope.legalEntityId) {
    throw new ScopeError(
      "organizationId and legalEntityId must not be duplicated"
    );
  }
}

// Deterministic legal-entity id used by the W0-03a backfill migration:
// each pre-existing Tenant was given exactly one LegalEntity with id `le_` + tenant.id.
// Rows whose legalEntityId is still NULL (flows not yet wired to the auth context)
// resolve to this backfilled entity. This is NOT duplicating tenantId into
// legalEntityId — the two ids differ and the LegalEntity row exists in the DB.
export function backfillLegalEntityId(tenantId: string): string {
  assertSegment("tenantId", tenantId);
  return `le_${tenantId}`;
}
