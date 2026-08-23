import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";
import type { Request } from "express";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post("login")
  async login(@Body() body: { login: string; password: string }) {
    return this.auth.login(body.login, body.password);
  }

  // ADR-027: обмен purpose-limited selection token на полноценный
  // active-scope access token. Заголовки tenant/legalEntity не принимаются.
  @Public()
  @HttpCode(200)
  @Post("select-legal-entity")
  async selectLegalEntity(
    @Req() req: Request,
    @Body() body: { legalEntityId?: string }
  ) {
    const header = req.headers["authorization"];
    const raw = header?.startsWith("Bearer ") ? header.slice(7) : "";
    return this.auth.selectLegalEntity(raw, body.legalEntityId ?? "");
  }
}
