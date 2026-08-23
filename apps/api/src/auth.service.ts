import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { PrismaService } from "./prisma.service";
import { ActiveScopeResolver, MembershipError } from "./active-scope.resolver";
import { createHash } from "node:crypto";

export interface JwtClaims {
  sub: string;
  tenantId: string | null;
  roles: string[];
  mfaCompleted: boolean;
  /** W0-03a (ADR-027): активное юрлицо; обязательно для клиентских ролей. */
  activeLegalEntityId?: string | null;
  /** purpose-limited selection token — не даёт доступа к бизнес-данным. */
  purpose?: "le-select";
  jti?: string;
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
    selectionRequired?: boolean;
  }> {
    const user = await this.prisma.user.findUnique({ where: { login } });
    if (!user) throw new UnauthorizedException("invalid credentials");
    const hash = AuthService.hashPassword(password);
    if (user.passwordHash !== hash)
      throw new UnauthorizedException("invalid credentials");

    const roles: string[] = JSON.parse(user.roles);
    if (!user.tenantId && !roles.includes("operator")) {
      throw new UnauthorizedException("no tenant");
    }

    const mfaEnabled = process.env.MFA_ENABLED === "true";
    const mfaRequired =
      mfaEnabled &&
      roles.some((r: string) =>
        ["admin", "accountant", "operator", "marking"].includes(r)
      );

    // ADR-027: ровно одно активное membership выдаёт active scope; несколько →
    // purpose-limited selection token (выбор юрлица — отдельный flow); ноль → 403.
    let activeLegalEntityId: string | null = null;
    let selectionToken: string | undefined;
    if (user.tenantId) {
      try {
        activeLegalEntityId = await this.scopes.membershipForLogin(
          user.tenantId,
          user.id
        );
      } catch (e) {
        if (e instanceof MembershipError) {
          if (e.reason === "selection-required") {
            selectionToken = this.issueSelectionToken(user.id, user.tenantId);
          } else {
            throw new ForbiddenException("no legal entity membership");
          }
        } else {
          throw e;
        }
      }
    }

    if (selectionToken) {
      return {
        token: selectionToken,
        tenantId: user.tenantId ?? null,
        roles: [],
        activeLegalEntityId: null,
        selectionRequired: true,
      };
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

  // ─── ADR-027: выбор юрлица при нескольких членствах ────────────────────────
  // ADR-027: JTI store is database-backed (UsedSelectionToken) — survives restarts.
  private readonly selectAttempts = new Map<string, number[]>();

  /** Короткоживущий purpose-limited токен: sub+tenantId+jti, БЕЗ ролей/scope. */
  issueSelectionToken(userId: string, tenantId: string): string {
    return this.jwt.sign({
      sub: userId,
      tenantId,
      roles: [],
      mfaCompleted: false,
      purpose: "le-select",
      jti: randomUUID(),
    } as JwtClaims);
  }

  private rateLimited(userId: string): boolean {
    const now = Date.now();
    const window = (this.selectAttempts.get(userId) ?? []).filter(
      (t) => now - t < 60_000
    );
    window.push(now);
    this.selectAttempts.set(userId, window);
    return window.length > 10;
  }

  async selectLegalEntity(
    selectionToken: string,
    legalEntityId: string
  ): Promise<{
    token: string;
    tenantId: string;
    roles: string[];
    activeLegalEntityId: string;
  }> {
    let claims: JwtClaims;
    try {
      claims = this.jwt.verify(selectionToken) as JwtClaims;
    } catch {
      throw new UnauthorizedException("invalid or expired selection token");
    }
    if (
      claims.purpose !== "le-select" ||
      !claims.tenantId ||
      !claims.jti ||
      !claims.sub
    ) {
      throw new UnauthorizedException("invalid selection token");
    }
    const existing = await this.prisma.usedSelectionToken.findUnique({
      where: { jti: claims.jti },
    });
    if (existing) {
      throw new UnauthorizedException("selection token already used");
    }
    if (!legalEntityId || legalEntityId.trim() === "") {
      throw new ForbiddenException("legal entity not available for user");
    }
    if (this.rateLimited(claims.sub)) {
      throw new HttpException(
        "too many selection attempts",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    try {
      const le = await this.scopes.membershipForLogin(
        claims.tenantId,
        claims.sub,
        legalEntityId
      );
      await this.prisma.usedSelectionToken
        .create({ data: { jti: claims.jti } })
        .catch(() => {});
      // ADR-027 defense-in-depth: пользователь обязан существовать и принадлежать tenant
      const user = await this.prisma.user.findFirst({
        where: { id: claims.sub, tenantId: claims.tenantId },
      });
      if (!user) throw new ForbiddenException("user not found");
      let roles: string[] = [];
      try {
        roles = JSON.parse(user?.roles ?? "[]") as string[];
      } catch {
        roles = [];
      }
      const token = this.jwt.sign({
        sub: claims.sub,
        tenantId: claims.tenantId,
        roles,
        mfaCompleted: false,
        activeLegalEntityId: le,
      } as JwtClaims);
      return {
        token,
        tenantId: claims.tenantId,
        roles,
        activeLegalEntityId: le,
      };
    } catch (e) {
      if (e instanceof MembershipError) {
        throw new ForbiddenException("legal entity not available for user");
      }
      throw e;
    }
  }
}
