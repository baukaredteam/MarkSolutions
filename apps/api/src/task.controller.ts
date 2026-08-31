import { Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TaskService } from "./task.service";
import { Roles, READ_ROLES } from "./guards";
import { tenantOfOrThrow } from "./dashboard.service";

@Controller("tasks")
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Req() req: Request) {
    return this.tasks.list(
      tenantOfOrThrow(req as unknown as { tenantId?: string | null })
    );
  }

  @Roles(...READ_ROLES)
  @HttpCode(201)
  @Post()
  create(@Req() req: Request) {
    return this.tasks.createFromSources(
      tenantOfOrThrow(req as unknown as { tenantId?: string | null })
    );
  }
}
