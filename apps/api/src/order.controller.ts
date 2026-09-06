import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { OrderService } from "./order.service";
import { Roles } from "./guards";
import { READ_ROLES } from "./guards";
import type { CreateOrderDto } from "./order/order.dto";

function tenantOf(req: Request): string {
  const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}

@Injectable()
@Controller("orders")
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Roles("admin", "manager")
  @HttpCode(201)
  @Post()
  async create(
    @Req() req: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateOrderDto
  ) {
    return this.orders.create(tenantOf(req), idempotencyKey ?? "", body);
  }

  @Roles("admin", "manager")
  @HttpCode(200)
  @Post(":id/cancel")
  async cancel(@Req() req: Request, @Param("id") id: string) {
    return this.orders.cancel(tenantOf(req), id);
  }

  @Roles(...READ_ROLES)
  @Get()
  async list(@Req() req: Request) {
    return { items: await this.orders.list(tenantOf(req)) };
  }

  @Roles(...READ_ROLES)
  @Get(":id")
  async get(@Req() req: Request, @Param("id") id: string) {
    return this.orders.get(tenantOf(req), id);
  }
}
