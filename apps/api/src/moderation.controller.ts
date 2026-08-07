import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { Roles } from "./guards";
import { PrismaService } from "./prisma.service";
import { ModerationService } from "./moderation.service";

// Очередь и решения модерации (CAT-013). Роль OPERATOR — только модерация:
// tenant-данные (продукты/карточки) оператору НЕ отдаются (TenantGuard: нет tenantId).
@Controller("moderation")
@Roles("operator")
export class ModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly prisma: PrismaService
  ) {}

  @Get("queue")
  async queue(
    @Query("status") status?: string,
    @Query("tenantId") tenantId?: string
  ) {
    return { items: await this.moderation.queue(status, tenantId) };
  }

  @Get("exceptions")
  async exceptions() {
    // ID-017: дашборд исключений оператора — таймауты/ошибки регистрации НКТ
    const rows = await this.prisma.outbox.findMany({
      where: { aggregate: "nkt-register", status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { items: rows };
  }

  @HttpCode(200)
  @Post(":id/approve")
  async approve(@Req() req: Request, @Param("id") id: string) {
    return this.moderation.approve(
      id,
      (req as unknown as { actor: string }).actor
    );
  }

  @HttpCode(200)
  @Post(":id/reject")
  async reject(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { fieldReasons: Record<string, string> }
  ) {
    return this.moderation.reject(
      id,
      (req as unknown as { actor: string }).actor,
      body.fieldReasons
    );
  }
}
