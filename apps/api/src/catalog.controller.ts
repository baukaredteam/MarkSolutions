import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Param,
  ConflictException,
  BadRequestException,
  Injectable,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";
import {
  tnvedHint,
  heuristicStrengthensFix,
  isInList,
  validateAttributes,
  autofillAttributes,
  type MotorOilAttributes,
} from "@markflow/shared";

interface DraftRow {
  name?: string;
  tnved?: string;
  brand?: string;
  sae?: string;
  volumeL?: number;
  gtin?: string;
  demo?: boolean;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // Предпроверка дубля GTIN у tenant (Q4): активная (не Archived) → конфликт.
  private async assertGtinFree(tenantId: string, gtin: string): Promise<void> {
    const existing = await this.prisma.productCard.findFirst({
      where: { tenantId, gtin, status: { not: "ARCHIVED" } },
    });
    if (existing) {
      throw new ConflictException({
        code: 409,
        message: `card with gtin ${gtin} already exists`,
        details: { cardId: existing.id },
        fieldErrors: {},
        correlationId: "",
        retryable: false,
      });
    }
  }

  async createCard(
    tenantId: string,
    body: { gtin: string; attributes: Record<string, unknown> }
  ): Promise<unknown> {
    if (!body.gtin || !/^\d{14}$/.test(body.gtin)) {
      throw new BadRequestException("gtin must be 14 digits");
    }
    // AT-03: ярус A пусто → ошибки по полям (validateAttributes из схемы)
    const filled = autofillAttributes(
      body.attributes as Partial<MotorOilAttributes>,
      {}
    );
    const v = validateAttributes(filled);
    if (!v.ok) {
      throw new BadRequestException({
        code: 400,
        message: "tier A incomplete",
        details: null,
        fieldErrors: v.errors,
        correlationId: "",
        retryable: false,
      });
    }
    await this.assertGtinFree(tenantId, body.gtin);
    const card = await this.prisma.productCard.create({
      data: {
        tenantId,
        gtin: body.gtin,
        status: "DRAFT",
        attributes: { ...body.attributes, schemaVersion: 1, gtin: body.gtin },
      },
    });
    return card;
  }

  async createDraft(tenantId: string, row: DraftRow): Promise<unknown> {
    const tnved = row.tnved ?? "";
    const missing: string[] = [];
    if (!row.gtin) missing.push("gtin");
    if (!row.name) missing.push("name");
    if (!row.sae) missing.push("sae");
    const inList = isInList(tnved);
    const hint = tnvedHint(tnved);
    const strengthen = heuristicStrengthensFix(row.name ?? "");
    // ADR-022: DraftProposal — «добор» + подсказка, не блокирует
    const status = inList ? "DRAFT" : "DOBOR";
    return this.prisma.draftProposal.create({
      data: {
        tenantId,
        source: "invoice",
        proposed: {
          schemaVersion: 1,
          name: row.name,
          tnved,
          brand: row.brand,
          sae: row.sae,
          volumeL: row.volumeL,
          confidence: 0.8,
          tnvedHint: hint,
          strengthenFix: strengthen,
        },
        missing,
        status,
        demo: row.demo ?? false,
      },
    });
  }

  async listDrafts(tenantId: string): Promise<unknown[]> {
    return this.prisma.draftProposal.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  private async appendAudit(
    id: string,
    actor: string,
    action: string
  ): Promise<void> {
    const cur = await this.prisma.draftProposal.findUnique({ where: { id } });
    if (!cur) return;
    const audit =
      (cur.audit as { at: string; actor: string; action: string }[]) ?? [];
    await this.prisma.draftProposal.update({
      where: { id },
      data: {
        audit: [...audit, { at: new Date().toISOString(), actor, action }],
      },
    });
  }

  // ADR-022: «Исправить код» — выбор кода из перечня, строка → карточка/Submitted-путь.
  async fixTnved(
    tenantId: string,
    id: string,
    actor: string,
    newTnved: string
  ): Promise<unknown> {
    if (!isInList(newTnved))
      throw new BadRequestException(`tnved not in list: ${newTnved}`);
    const draft = await this.prisma.draftProposal.findFirst({
      where: { id, tenantId },
    });
    if (!draft) throw new BadRequestException("draft not found");
    const proposed = draft.proposed as Record<string, unknown>;
    await this.prisma.draftProposal.update({
      where: { id },
      data: {
        proposed: { ...proposed, tnved: newTnved, tnvedHint: null },
        status: "DRAFT",
      },
    });
    await this.appendAudit(id, actor, `fix_tnved:${newTnved}`);
    return { id, status: "DRAFT" };
  }

  // ADR-022: «Не подлежит маркировке» — терминальный «вне скоупа».
  async outOfScope(
    tenantId: string,
    id: string,
    actor: string
  ): Promise<unknown> {
    const draft = await this.prisma.draftProposal.findFirst({
      where: { id, tenantId },
    });
    if (!draft) throw new BadRequestException("draft not found");
    await this.prisma.draftProposal.update({
      where: { id },
      data: { status: "OUT_OF_SCOPE" },
    });
    await this.appendAudit(id, actor, "out_of_scope");
    return { id, status: "OUT_OF_SCOPE" };
  }

  // Фаза 2 (ADR-022): гейт на Submitted — «вне перечня И без решения» не отправляется.
  async submitDraft(
    tenantId: string,
    id: string,
    actor: string
  ): Promise<unknown> {
    const draft = await this.prisma.draftProposal.findFirst({
      where: { id, tenantId },
    });
    if (!draft) throw new BadRequestException("draft not found");
    const tnved = (draft.proposed as Record<string, unknown>).tnved as
      string | undefined;
    const outOfScope = draft.status === "OUT_OF_SCOPE";
    const inList = tnved ? isInList(tnved) : false;
    if (outOfScope) throw new BadRequestException("draft is out of scope");
    if (tnved && !inList) {
      throw new BadRequestException(
        "TNVED вне перечня — выберите «Исправить код» или «Не подлежит маркировке»"
      );
    }
    await this.prisma.draftProposal.update({
      where: { id },
      data: { status: "SUBMITTED" },
    });
    await this.appendAudit(id, actor, "submit");
    return { id, status: "SUBMITTED" };
  }

  async seedInvoice(tenantId: string): Promise<number> {
    // читаем фикстуру (38 реальных + 2 demo)
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const rows = JSON.parse(
      readFileSync(join(process.cwd(), "fixtures", "invoice-38.json"), "utf8")
    ) as DraftRow[];
    for (const r of rows) {
      await this.createDraft(tenantId, { ...r, demo: r.demo ?? false });
    }
    return rows.length;
  }
}

@Controller("products")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("drafts")
  async drafts(@Req() req: Request) {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    return { items: await this.catalog.listDrafts(tenantId) };
  }

  @HttpCode(201)
  @Post("drafts/import")
  async importDrafts(@Req() req: Request, @Body() body: { rows: DraftRow[] }) {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    // MVP: синхронно создаём (OutboxPoller-асинхронность — след. итерация),
    // но возвращаем jobId для совместимости с acceptance.
    for (const row of body.rows) await this.catalog.createDraft(tenantId, row);
    return { jobId: `job-${Date.now()}`, created: body.rows.length };
  }

  @HttpCode(201)
  @Post("cards")
  async createCard(
    @Req() req: Request,
    @Body() body: { gtin: string; attributes: Record<string, unknown> }
  ) {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    return this.catalog.createCard(tenantId, body);
  }

  @HttpCode(200)
  @Post("drafts/:id/fix-tnved")
  async fixTnved(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { tnved: string }
  ) {
    return this.catalog.fixTnved(
      (req as unknown as { tenantId: string }).tenantId,
      id,
      (req as unknown as { actor: string }).actor,
      body.tnved
    );
  }

  @HttpCode(200)
  @Post("drafts/:id/out-of-scope")
  async outOfScope(@Req() req: Request, @Param("id") id: string) {
    return this.catalog.outOfScope(
      (req as unknown as { tenantId: string }).tenantId,
      id,
      (req as unknown as { actor: string }).actor
    );
  }

  @HttpCode(200)
  @Post("drafts/:id/submit")
  async submitDraft(@Req() req: Request, @Param("id") id: string) {
    return this.catalog.submitDraft(
      (req as unknown as { tenantId: string }).tenantId,
      id,
      (req as unknown as { actor: string }).actor
    );
  }
}

@Controller("demo")
export class DemoController {
  constructor(private readonly catalog: CatalogService) {}

  @HttpCode(201)
  @Post("seed-invoice")
  async seed(@Req() req: Request) {
    if (process.env.DEMO_ENABLED !== "true") {
      throw new BadRequestException("demo disabled");
    }
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const count = await this.catalog.seedInvoice(tenantId);
    return { count };
  }
}
