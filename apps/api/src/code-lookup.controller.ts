import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { CodeLookupService, tenantOf } from "./code-lookup.service";
import { Roles } from "./guards";

@Controller()
export class CodeLookupController {
  constructor(private readonly service: CodeLookupService) {}

  // POST /codes/lookup {code} — поиск КМ по codeKey/raw/GTIN (UI-03)
  @Roles("admin", "manager", "accountant", "marking", "warehouse", "viewer")
  @HttpCode(200)
  @Post("codes/lookup")
  lookup(@Req() req: Request, @Body() body: { code: string }) {
    if (!body?.code) throw new BadRequestException("code required");
    return this.service.lookup(
      tenantOf(req as unknown as { tenantId?: string | null }),
      body.code
    );
  }
}
