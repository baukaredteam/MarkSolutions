import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  SetMetadata,
  CustomDecorator,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { JwtClaims } from "./auth.service";

export const Roles = (...roles: string[]): CustomDecorator =>
  SetMetadata("roles", roles);

// tenant-guard читает tenant ТОЛЬКО из JWT-клейма (ADR-017 апдейт).
// x-tenant-id header игнорируется. Без/невалидный JWT → 401.
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
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
    // оператор модерации — глобальная роль без tenant (CAT-013): ему tenant не нужен,
    // tenant-scoped эндпоинты с req.tenantId=null не вернут чужие данные.
    const isOperator = roles.includes("operator");
    if (!claims.tenantId && !isOperator) {
      throw new UnauthorizedException("invalid jwt");
    }
    req.tenantId = claims.tenantId ?? null;
    req.roles = roles;
    req.mfaCompleted = claims.mfaCompleted ?? false;
    req.actor = claims.sub;
    return true;
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
