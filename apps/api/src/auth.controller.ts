import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @HttpCode(200)
  @Post("login")
  async login(@Body() body: { login: string; password: string }) {
    return this.auth.login(body.login, body.password);
  }
}
