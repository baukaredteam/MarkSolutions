import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  SetMetadata,
  CustomDecorator,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { JwtClaims } from "./auth.service";
import { ActiveScopeResolver, MembershipError } from "./active-scope.resolver";
import type { ActiveScope } from "./active-scope.resolver";

export const Roles = (...roles: string[]): CustomDecorator =>
  SetMetadata("roles", roles);

// T0-RBAC: клиентские роли (матрица в CONTEXT.md). operator — глобальная без tenant.
export const CLIENT_ROLES = [
  "admin",
  "manager",
  "accountant",
  "marking",
  "warehouse",
  "viewer",
] as const;
// GET-эндпоинты доступны ВСЕМ клиентским ролям (ТЗ: чтение разрешено по политике)
export const READ_ROLES = [...CLIENT_ROLES] as const;

// tenant-guard читает tenant/scope ТОЛЬКО из JWT-клеймов (ADR-017/ADR-027).
// x-tenant-id и любые другие заголовки игнорируются. Без/невалидный JWT → 401.
//
// W0-03a pt2 (ADR-027): guard асинхронный, на КАЖДОМ защищённом запросе
// валидирует tenantId + activeLegalEntityId + membership через ActiveScopeResolver
// и кладёт validated value object на request.activeScope.
// Оператор модерации проходит БЕЗ scope — но защищённые клиентские данные
// требуют scope-объект (activeScopeOf), поэтому глобального bypass нет.
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly scopes: ActiveScopeResolver
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header = req.headers["authorization"];
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("jwt required");
    }
    let claims: JwtClaims;
    try {
      claims = this.jwt.verify(header.slice(7)) as JwtClaims;
    } catch {
      throw new UnauthorizedException("invalid jwt");
    }
    const roles = claims.roles ?? [];
    const isOperator = roles.includes("operator");
    if (!claims.tenantId && !isOperator) {
      throw new UnauthorizedException("invalid jwt");
    }
    req.tenantId = claims.tenantId ?? null;
    req.roles = roles;
    req.mfaCompleted = claims.mfaCompleted ?? false;
    req.actor = claims.sub;

    if (!claims.tenantId) return true; // оператор: клиентские данные закрыты activeScopeOf

    try {
      const scope: ActiveScope = await this.scopes.resolve({
        tenantId: claims.tenantId,
        activeLegalEntityId: claims.activeLegalEntityId ?? null,
        userId: claims.sub,
      });
      req.activeScope = {
        organizationId: scope.organizationId,
        legalEntityId: scope.legalEntityId,
      };
      req.legalEntityId = scope.legalEntityId;
      return true;
    } catch (e) {
      if (e instanceof MembershipError) {
        if (e.reason === "selection-required")
          throw new ConflictException("legal-entity selection required");
        throw new ForbiddenException("active legal entity membership required");
      }
      throw e;
    }
  }
}

// Ролевой guard: для admin-эндпоинтов; MFA-заглушка (IAM-006): при MFA_ENABLED=true
// и обязательной роли без второго фактора → 403.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>("roles", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const hasRole = (req.roles ?? []).some((r: string) => roles.includes(r));
    if (!hasRole) throw new ForbiddenException("insufficient role");

    if (process.env.MFA_ENABLED === "true" && !req.mfaCompleted) {
      throw new ForbiddenException("mfa required");
    }
    return true;
  }
}
