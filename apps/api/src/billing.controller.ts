import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { BillingService } from "./billing.service";
import { Roles } from "./guards";
import { READ_ROLES } from "./guards";

function tenantOf(req: Request): string {
  const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}

function toStr(v: bigint): string {
  return v.toString();
}

@Injectable()
@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Roles("admin", "accountant")
  @Post("payments/import")
  async importPayment(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { ref1c: string; amount: string | number; reason?: string }
  ) {
    // Служебный (W5-07): сверка с 1С. Счета оплачиваются через /billing/invoices/:id/confirm.
    const amount = BigInt(body.amount);
    const { entry, existing } = await this.billing.topup(
      tenantOf(req),
      body.ref1c,
      amount,
      body.reason
    );
    res.status(existing ? 200 : 201);
    return { ...entry, amount: toStr(entry.amount) };
  }

  @HttpCode(201)
  @Post("reserve")
  async reserve(
    @Req() req: Request,
    @Body() body: { orderId: string; amount: string | number; reason?: string }
  ) {
    const entry = await this.billing.reserve(
      tenantOf(req),
      body.orderId,
      BigInt(body.amount),
      body.reason
    );
    return { ...entry, amount: toStr(entry.amount) };
  }

  @HttpCode(200)
  @Post("release")
  async release(
    @Req() req: Request,
    @Body() body: { orderId: string; reason?: string }
  ) {
    const entry = await this.billing.release(
      tenantOf(req),
      body.orderId,
      body.reason
    );
    return { ...entry, amount: toStr(entry.amount) };
  }

  @HttpCode(200)
  @Post("settle")
  async settle(
    @Req() req: Request,
    @Body() body: { orderId: string; amount: string | number; reason?: string }
  ) {
    const entry = await this.billing.settle(
      tenantOf(req),
      body.orderId,
      BigInt(body.amount),
      body.reason
    );
    return { ...entry, amount: toStr(entry.amount) };
  }

  @Roles(...READ_ROLES)
  @Get("balance")
  async balance(@Req() req: Request) {
    const b = await this.billing.getBalance(tenantOf(req));
    return {
      balance: toStr(b.balance),
      reserved: toStr(b.reserved),
      available: toStr(b.available),
    };
  }

  // UI-06c: журнал проводок (desc, «баланс после операции»)
  @Roles(...READ_ROLES)
  @Get("ledger")
  async ledger(@Req() req: Request) {
    return this.billing.ledger(tenantOf(req));
  }

  @Get("tariff/active")
  async activeTariff() {
    const t = await this.billing.activeTariff();
    return {
      id: t.id,
      pricePerCodeKZT: toStr(t.pricePerCodeKZT),
      unit: t.unit,
      currency: t.currency,
    };
  }
}
