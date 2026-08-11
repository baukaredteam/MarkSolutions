import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { DashboardService, tenantOfOrThrow } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  // Q10: снимок 5 счётчиков «Следующие действия»
  @Get("summary")
  summary(@Req() req: Request) {
    return this.dashboard.summary(
      tenantOfOrThrow(req as unknown as { tenantId?: string | null })
    );
  }
}
