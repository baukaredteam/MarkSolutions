import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "./prisma.service";
import { createHash } from "node:crypto";

export interface JwtClaims {
  sub: string;
  tenantId: string | null;
  roles: string[];
  mfaCompleted: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  // демо-хэш (не для prod): sha256 пароля
  static hashPassword(p: string): string {
    return createHash("sha256").update(p).digest("hex");
  }

  async login(
    login: string,
    password: string
  ): Promise<{ token: string; tenantId: string | null }> {
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
    // IAM-006 заглушка: при MFA_ENABLED=true обязательные роли требуют второй фактор
    const mfaRequired =
      mfaEnabled &&
      roles.some((r: string) =>
        ["admin", "accountant", "operator"].includes(r)
      );

    const claims: JwtClaims = {
      sub: user.id,
      tenantId: user.tenantId ?? null,
      roles,
      mfaCompleted: !mfaRequired, // без второго фактора → false при MFA_ENABLED
    };
    return {
      token: this.jwt.sign(claims),
      tenantId: user.tenantId ?? null,
    };
  }
}
