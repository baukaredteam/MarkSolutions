import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "./prisma.service";
import { ActiveScopeResolver } from "./active-scope.resolver";
import { MembershipError } from "./active-scope.resolver";
import { createHash } from "node:crypto";

export interface JwtClaims {
  sub: string;
  tenantId: string | null;
  roles: string[];
  mfaCompleted: boolean;
  /** W0-03a pt2 (ADR-027): активное юрлицо; обязателен для клиентских ролей. */
  activeLegalEntityId?: string | null;
}

// Детерминированный ответ, когда у пользователя несколько членств:
// выбор юрлица и mint нового токена — отдельное ревьюимое flow (ADR-027).
export class LegalEntitySelectionRequired extends ConflictException {
  constructor(memberships: string[]) {
    super({
      code: 409,
      message: "legal-entity selection required",
      details: { memberships },
      fieldErrors: {},
      correlationId: "",
      retryable: false,
    });
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly scopes: ActiveScopeResolver
  ) {}

  // демо-хэш (не для prod): sha256 пароля
  static hashPassword(p: string): string {
    return createHash("sha256").update(p).digest("hex");
  }

  async login(
    login: string,
    password: string
  ): Promise<{
    token: string;
    tenantId: string | null;
    roles: string[];
    activeLegalEntityId: string | null;
  }> {
    const user = await this.prisma.user.findUnique({ where: { login } });
    if (!user) throw new UnauthorizedException("invalid credentials");
    const hash = AuthService.hashPassword(password);
    if (user.passwordHash !== hash)
      throw new UnauthorizedException("invalid credentials");

    const roles: string[] = JSON.parse(user.roles);
    // оператор модерации — глобальная роль без tenant (CAT-013); остальные обязаны иметь tenant
    if (!user.tenantId && !roles.includes("operator")) {
      throw new UnauthorizedException("no tenant");
    }

    const mfaEnabled = process.env.MFA_ENABLED === "true";
    const mfaRequired =
      mfaEnabled &&
      roles.some((r: string) =>
        ["admin", "accountant", "operator", "marking"].includes(r)
      );

    // W0-03a pt2 (ADR-027): ровно одно активное membership может выдать active scope.
    let activeLegalEntityId: string | null = null;
    if (user.tenantId) {
      try {
        activeLegalEntityId = await this.scopes.membershipForLogin(
          user.tenantId,
          user.id
        );
      } catch (e) {
        if (e instanceof MembershipError) {
          if (e.reason === "selection-required")
            throw new LegalEntitySelectionRequired(
              (
                await this.prisma.userLegalEntityMembership.findMany({
                  where: { userId: user.id },
                  select: { legalEntityId: true },
                })
              ).map((m) => m.legalEntityId)
            );
          throw new ForbiddenException("no legal entity membership");
        }
        throw e;
      }
    }

    const claims: JwtClaims = {
      sub: user.id,
      tenantId: user.tenantId ?? null,
      roles,
      mfaCompleted: !mfaRequired,
      activeLegalEntityId,
    };
    return {
      token: this.jwt.sign(claims),
      tenantId: user.tenantId ?? null,
      roles,
      activeLegalEntityId,
    };
  }
}
