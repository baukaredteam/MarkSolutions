import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { ScopeError, assertScope, type LegalEntityScope } from "./scope";

// W0-03a part 2 (ADR-027) — ActiveScopeResolver.
//
// Deep seam: callers hand it authenticated claims and receive a validated
// ActiveLegalEntityScope — or a typed failure. Callers never assemble
// { organizationId, legalEntityId } themselves, never fall back to
// `le_${tenantId}` and never trust headers.

export class MembershipError extends Error {
  constructor(
    readonly reason: "no-membership" | "selection-required" | "mismatch"
  ) {
    super(
      reason === "no-membership"
        ? "no legal entity membership"
        : reason === "mismatch"
          ? "active legal entity does not belong to tenant"
          : "legal-entity selection required"
    );
    this.name = "MembershipError";
  }
}

export interface ActiveScopeClaims {
  tenantId: string | null;
  activeLegalEntityId?: string | null;
  userId?: string;
}

export type ActiveScope = LegalEntityScope & { userId: string };

const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;

function assertSegment(name: string, value: string): void {
  if (!value || !SEGMENT_RE.test(value)) {
    throw new ScopeError(`${name} is not a valid scope segment`);
  }
}

@Injectable()
export class ActiveScopeResolver {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate claims against memberships; return the validated request scope. */
  async resolve(claims: ActiveScopeClaims): Promise<ActiveScope> {
    const { tenantId, activeLegalEntityId, userId = "" } = claims;
    assertSegment("tenantId", tenantId ?? "");
    assertSegment("userId", userId);
    if (!activeLegalEntityId) throw new MembershipError("no-membership");
    assertSegment("activeLegalEntityId", activeLegalEntityId);
    if (activeLegalEntityId === tenantId) {
      throw new MembershipError("mismatch");
    }

    const membership = await this.prisma.userLegalEntityMembership.findFirst({
      where: { userId, legalEntityId: activeLegalEntityId },
      include: { legalEntity: { select: { id: true, tenantId: true } } },
    });
    if (!membership || membership.legalEntity.tenantId !== tenantId) {
      throw new MembershipError("no-membership");
    }
    const scope: ActiveScope = {
      organizationId: tenantId,
      legalEntityId: activeLegalEntityId,
      userId,
    };
    assertScope(scope); // invariant: never duplicate tenantId into legalEntityId
    return scope;
  }

  /**
   * Login-time decision: exactly one active membership may mint an active scope.
   * zero → no-membership; >1 → selection-required (deterministic response).
   * With `expected`, validates that THIS legal entity is among the user's
   * memberships in the tenant (used by POST /auth/select-legal-entity).
   */
  async membershipForLogin(
    tenantId: string,
    userId: string,
    expected?: string
  ): Promise<string> {
    assertSegment("tenantId", tenantId);
    assertSegment("userId", userId);
    if (expected !== undefined) {
      assertSegment("legalEntityId", expected);
      const m = await this.prisma.userLegalEntityMembership.findFirst({
        where: { userId, legalEntityId: expected },
        include: { legalEntity: { select: { id: true, tenantId: true } } },
      });
      if (!m || m.legalEntity.tenantId !== tenantId) {
        throw new MembershipError("no-membership");
      }
      return expected;
    }
    const memberships = await this.prisma.userLegalEntityMembership.findMany({
      where: { userId, legalEntity: { tenantId } },
      select: { legalEntityId: true },
      orderBy: { createdAt: "asc" },
    });
    if (memberships.length === 0) throw new MembershipError("no-membership");
    if (memberships.length > 1) throw new MembershipError("selection-required");
    return memberships[0].legalEntityId;
  }
}
