import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
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
import { PrismaService } from "./prisma.service";
import { VaultService } from "./vault.service";
import { buildXlsx } from "@markflow/shared";
import { Roles } from "./guards";
import { READ_ROLES } from "./guards";

function tenantOf(req: Request): string {
  const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}

// СЃРµСЂРёР°Р»РёР·Р°С†РёСЏ РљРњ РёР· СЃС‚СЂСѓРєС‚СѓСЂС‹ (ADR-006): AI01+GTIN14+AI21+serial [+GS+AI91+AI92]
// km_full РґР»СЏ CSV вЂ” СЃ Р»РёС‚РµСЂР°Р»РѕРј <GS> (С‚РµРєСЃС‚, РЅРµ Р±Р°Р№С‚ 0x1D)
function kmFull(code: {
  gtin: string;
  serial: string;
  ai91: string | null;
  ai92: string | null;
  form: string;
}): string {
  let s = `01${code.gtin}21${code.serial}`;
  if (code.form === "extended" && (code.ai91 || code.ai92)) {
    if (code.ai91) s += `<GS>91${code.ai91}`;
    if (code.ai92) s += `<GS>92${code.ai92}`;
  }
  return s;
}

function toCsvRow(
  code: {
    gtin: string;
    serial: string;
    ai91: string | null;
    ai92: string | null;
    form: string;
  },
  orderId: string
): string {
  const cells = [
    code.gtin,
    code.serial,
    code.ai91 ?? "",
    code.ai92 ?? "",
    code.form,
    kmFull(code),
    orderId,
  ];
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";");
}

@Injectable()
@Controller()
export class VaultController {
  constructor(
    private readonly vault: VaultService,
    private readonly prisma: PrismaService
  ) {}

  // GET /api/codes вЂ” РјР°СЃРєРё РљРњ tenant (CV-031): Р±РµР· РїРѕР»РЅС‹С… serial, РѕРґРЅР° СЃС‚СЂРѕРєР° РЅР° Р·Р°РєР°Р·
  @Roles(...READ_ROLES)
  @Get("api/codes")
  async codes(@Req() req: Request) {
    const items = await this.vault.masks(tenantOf(req));
    const byOrder = new Map<
      string,
      {
        gtin: string;
        mask: string;
        status: string;
        orderId: string;
        quantity: number;
      }
    >();
    for (const i of items) {
      const cur = byOrder.get(i.orderId);
      if (cur) {
        cur.quantity += 1;
        cur.mask = i.mask; // РїРѕСЃР»РµРґРЅСЏСЏ РјР°СЃРєР°
      } else {
        byOrder.set(i.orderId, { ...i, quantity: 1 });
      }
    }
    return { items: [...byOrder.values()] };
  }

  // GET /codes/:orderId/codes — индивидуальные КМ заказа (W4-02, для печати)
  @Roles(...READ_ROLES)
  @Get("codes/:orderId/codes")
  async orderCodes(@Req() req: Request, @Param("orderId") orderId: string) {
    const items = await this.vault.codesByOrder(orderId, tenantOf(req));
    return { items };
  }

  // POST /codes/export вЂ” CSV РїРѕР»РЅС‹С… РљРњ (CV-032); С‚РѕР»СЊРєРѕ READY/Completed, РёРЅР°С‡Рµ 409.
  @Roles("admin", "manager", "marking")
  @HttpCode(201)
  @Post("codes/export")
  async export(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { orderId: string; reason?: string }
  ) {
    const tenantId = tenantOf(req);
    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
    });
    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException("order not found");
    if (
      order.status !== "COMPLETED" &&
      order.status !== "PARTIALLY_COMPLETED"
    ) {
      throw new ConflictException({
        code: 409,
        message: `РєРѕРґС‹ РµС‰С‘ РЅРµ СЌРјРёС‚РёСЂРѕРІР°РЅС‹ (${order.status})`,
        details: null,
        fieldErrors: {},
        correlationId: "",
        retryable: false,
      });
    }
    const codes = await this.vault.revealForExport(
      body.orderId,
      tenantId,
      order.cardId
    );
    const card = order.cardId
      ? await this.prisma.productCard.findUnique({
          where: { id: order.cardId },
        })
      : null;
    const attrs = (card?.attributes as Record<string, unknown>) ?? {};
    const csvLines = [
      "gtin;serial;ai91;ai92;form;km_full;orderId",
      ...codes.map((c) => toCsvRow(c, body.orderId)),
    ];
    const csv = "\uFEFF" + csvLines.join("\r\n") + "\r\n"; // UTF-8 BOM + CRLF
    const ts = Date.now();
    await this.vault.logExport(
      tenantId,
      body.orderId,
      (req as unknown as { actor: string }).actor,
      "export",
      codes.length,
      body.reason
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="markflow-codes-${body.orderId}-${ts}.csv"`
    );
    res.send(csv);
    void attrs;
  }

  // POST /codes/export/xlsx — Excel для людей (UI-05); CSV для 1С не меняем.
  // Все значения inlineStr (TEXT): gtin/serial/km_full с ведущими нулями сохраняются.
  @Roles("admin", "manager", "marking")
  @HttpCode(200)
  @Post("codes/export/xlsx")
  async exportXlsx(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: { orderId: string; reason?: string }
  ) {
    const tenantId = tenantOf(req);
    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
    });
    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException("order not found");
    if (
      order.status !== "COMPLETED" &&
      order.status !== "PARTIALLY_COMPLETED"
    ) {
      throw new ConflictException({
        code: 409,
        message: `коды ещё не эмитированы (${order.status})`,
        details: null,
        fieldErrors: {},
        correlationId: "",
        retryable: false,
      });
    }
    const codes = await this.vault.revealForExport(
      body.orderId,
      tenantId,
      order.cardId
    );
    const headers = [
      "gtin",
      "serial",
      "ai91",
      "ai92",
      "form",
      "km_full",
      "orderId",
    ];
    const rows = codes.map((c) => [
      c.gtin,
      c.serial,
      c.ai91 ?? "",
      c.ai92 ?? "",
      c.form,
      kmFull(c),
      body.orderId,
    ]);
    const xlsx = buildXlsx("codes", headers, rows);
    const ts = Date.now();
    await this.vault.logExport(
      tenantId,
      body.orderId,
      (req as unknown as { actor: string }).actor,
      "export",
      codes.length,
      body.reason
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="markflow-codes-${body.orderId}-${ts}.xlsx"`
    );
    res.send(xlsx);
  }

  // POST /codes/print вЂ” РїРѕР»РЅС‹Рµ РљРњ РґР»СЏ РїРµС‡Р°С‚Рё (Р·Р°РґРµР» W4); Р°СѓРґРёС‚ CV-032.
  @Roles("admin", "manager", "marking")
  @HttpCode(200)
  @Post("codes/print")
  async print(
    @Req() req: Request,
    @Body() body: { orderId: string; count: number; reason?: string }
  ) {
    const tenantId = tenantOf(req);
    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
    });
    if (!order || order.tenantId !== tenantId)
      throw new NotFoundException("order not found");
    if (
      order.status !== "COMPLETED" &&
      order.status !== "PARTIALLY_COMPLETED"
    ) {
      throw new ConflictException({
        code: 409,
        message: `РєРѕРґС‹ РµС‰С‘ РЅРµ СЌРјРёС‚РёСЂРѕРІР°РЅС‹ (${order.status})`,
        details: null,
        fieldErrors: {},
        correlationId: "",
        retryable: false,
      });
    }
    const codes = await this.vault.reveal(order.id, tenantId);
    const count = Math.min(body.count ?? codes.length, codes.length);
    await this.vault.logExport(
      tenantId,
      order.id,
      (req as unknown as { actor: string }).actor,
      "print",
      count,
      body.reason
    );
    return { codes: codes.slice(0, count) };
  }
}
