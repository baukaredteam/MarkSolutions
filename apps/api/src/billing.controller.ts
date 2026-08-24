import {
  Body,
  Controller,
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
import { activeScopeOf } from "./scoped-repository";
import { READ_ROLES } from "./guards";

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
    const scope = activeScopeOf(req);
    // сверка с 1С. Счета оплачиваются через /billing/invoices/:id/confirm.
    const amount = BigInt(body.amount);
    const { entry, existing } = await this.billing.topup(
      scope.organizationId,
      scope.legalEntityId,
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
    const scope = activeScopeOf(req);
    const entry = await this.billing.reserve(
      scope.organizationId,
      scope.legalEntityId,
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
    const scope = activeScopeOf(req);
    const entry = await this.billing.release(
      scope.organizationId,
      scope.legalEntityId,
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
    const scope = activeScopeOf(req);
    const entry = await this.billing.settle(
      scope.organizationId,
      scope.legalEntityId,
      body.orderId,
      BigInt(body.amount),
      body.reason
    );
    return { ...entry, amount: toStr(entry.amount) };
  }

  @Roles(...READ_ROLES)
  @Get("balance")
  async balance(@Req() req: Request) {
    const scope = activeScopeOf(req);
    const b = await this.billing.getBalance(
      scope.organizationId,
      scope.legalEntityId
    );
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
    const scope = activeScopeOf(req);
    return this.billing.ledger(scope.organizationId, scope.legalEntityId);
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
