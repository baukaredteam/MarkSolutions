import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { InvoiceService, invoiceNumber } from "./invoice.service";
import { PrismaService } from "./prisma.service";
import { Public } from "./public.decorator";
import { Roles, READ_ROLES } from "./guards";
import { activeScopeOf } from "./scoped-repository";
import { formatTenge } from "@markflow/shared";

@Injectable()
@Controller("billing")
export class InvoiceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly prisma: PrismaService
  ) {}

  // POST /billing/invoices {productGroup, quantity} → ISSUED (admin|accountant|manager)
  @Roles("admin", "accountant", "manager")
  @HttpCode(201)
  @Post("invoices")
  async create(
    @Req() req: Request,
    @Body() body: { productGroup: string; quantity: number }
  ) {
    return this.invoices.create(
      activeScopeOf(req).organizationId,
      activeScopeOf(req).legalEntityId,
      body
    );
  }

  // HTML-печать счёта (счёт на оплату, как ИП К9)
  @Roles(...READ_ROLES)
  @Get("invoices/:id/print")
  async print(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string
  ) {
    const scope = activeScopeOf(req);
    const inv = await this.prisma.invoice.findFirst({
      where: {
        id,
        tenantId: scope.organizationId,
        legalEntityId: scope.legalEntityId,
      },
    });
    if (!inv) throw new NotFoundException("invoice not found");
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: scope.organizationId },
    });
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Счёт ${invoiceNumber(inv.number)}</title></head>
<body style="font-family:Arial,sans-serif;margin:40px;max-width:760px">
<h1>Счёт на оплату № ${invoiceNumber(inv.number)}</h1>
<p>Дата: ${inv.date.toISOString().slice(0, 10)}</p>
<table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left">Продавец</th><th style="text-align:left">Покупатель</th></tr>
<tr><td>MarkFlow (ООО «Марк Солюшнс»)</td><td>${tenant?.name ?? ""} · ${tenant?.bin ?? ""}</td></tr></table>
<table style="width:100%;border-collapse:collapse;margin-top:20px">
<tr><th style="border:1px solid #999;padding:6px;text-align:left">Группа</th><th style="border:1px solid #999;padding:6px">Кол-во</th><th style="border:1px solid #999;padding:6px">Цена/КМ</th><th style="border:1px solid #999;padding:6px">Без НДС</th><th style="border:1px solid #999;padding:6px">НДС ${inv.vatRatePct}%</th><th style="border:1px solid #999;padding:6px">С НДС</th></tr>
<tr><td style="border:1px solid #999;padding:6px">${inv.productGroup}</td><td style="border:1px solid #999;padding:6px;text-align:right">${inv.quantity}</td><td style="border:1px solid #999;padding:6px;text-align:right">${formatTenge(inv.unitPrice)}</td><td style="border:1px solid #999;padding:6px;text-align:right">${formatTenge(inv.sumWithoutVat)}</td><td style="border:1px solid #999;padding:6px;text-align:right">${formatTenge(inv.vat)}</td><td style="border:1px solid #999;padding:6px;text-align:right">${formatTenge(inv.sumWithVat)}</td></tr>
</table>
<p style="margin-top:16px"><b>Итого с НДС: ${formatTenge(inv.sumWithVat)}</b></p>
<p>Статус: ${inv.status}</p>
</body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }

  // POST /billing/invoices/:id/confirm {paymentRef} → TOPUP(ref1c=номер) → PAID
  @Roles("admin", "accountant")
  @HttpCode(200)
  @Post("invoices/:id/confirm")
  async confirm(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { paymentRef: string }
  ) {
    const scope = activeScopeOf(req);
    return this.invoices.confirm(
      scope.organizationId,
      scope.legalEntityId,
      id,
      body.paymentRef
    );
  }

  // Kaspi-вебхук: авто-PAID (мок-провайдер); без JWT (вызов со стороны провайдера)
  @Public()
  @HttpCode(200)
  @Post("providers/kaspi/webhook")
  async kaspiWebhook(
    @Body()
    body: {
      invoiceId: string;
      paymentRef: string;
      signature?: string;
    }
  ) {
    return this.invoices.kaspiWebhook(body, process.env.KASPI_WEBHOOK_SECRET);
  }

  @Roles(...READ_ROLES)
  @Get("invoices")
  async list(@Req() req: Request) {
    const scope = activeScopeOf(req);
    return this.invoices.list(scope.organizationId, scope.legalEntityId);
  }
}
