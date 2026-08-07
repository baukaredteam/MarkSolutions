import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Param,
  Query,
  ConflictException,
  BadRequestException,
  NotFoundException,
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
  checkDuplicate,
  fuzzyKeyOf,
  type MotorOilAttributes,
  type FuzzyKey,
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

  async createCard(
    tenantId: string,
    actor: string,
    body: {
      gtin: string;
      attributes: Record<string, unknown>;
      confirmDuplicate?: boolean;
    }
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
    try {
      // F1: assert + create в одной транзакции; partial unique index — вторая защита
      const card = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.productCard.findFirst({
          where: { tenantId, gtin: body.gtin, status: { not: "ARCHIVED" } },
        });
        if (existing) {
          throw new ConflictException({
            code: 409,
            message: `card with gtin ${body.gtin} already exists`,
            details: { cardId: existing.id },
            fieldErrors: {},
            correlationId: "",
            retryable: false,
          });
        }
        // F3: нечёткий дубль (бренд+модель+объём+SAE) → warning; confirmDuplicate не задан → 409
        const fuzzyCandidate: FuzzyKey = fuzzyKeyOf({
          brand: String(filled.brand ?? ""),
          model: String(filled.model ?? ""),
          volumeL: Number(filled.volumeL ?? 0),
          sae: String(filled.sae ?? ""),
        });
        const fuzzyHits = await tx.productCard.findMany({
          where: {
            tenantId,
            status: { not: "ARCHIVED" },
            gtin: { not: body.gtin },
          },
        });
        const matches = fuzzyHits.filter((c) => {
          const a = c.attributes as Record<string, unknown>;
          return checkDuplicate(fuzzyCandidate, [
            fuzzyKeyOf({
              brand: String(a.brand ?? ""),
              model: String(a.model ?? ""),
              volumeL: Number(a.volumeL ?? 0),
              sae: String(a.sae ?? ""),
            }),
          ]);
        });
        if (matches.length > 0 && body.confirmDuplicate !== true) {
          throw new ConflictException({
            code: 409,
            message: "fuzzy duplicate detected",
            details: {
              warning: "fuzzy_duplicate",
              existing: matches.map((m) => ({
                id: m.id,
                gtin: m.gtin,
                name: (m.attributes as Record<string, unknown>).name,
              })),
            },
            fieldErrors: {},
            correlationId: "",
            retryable: false,
          });
        }
        const created = await tx.productCard.create({
          data: {
            tenantId,
            gtin: body.gtin,
            status: "DRAFT",
            attributes: {
              ...body.attributes,
              schemaVersion: 1,
              gtin: body.gtin,
            },
          },
        });
        // F3: «Продолжить создание» (override fuzzy-дубля) — аудируется (CAT-014)
        if (matches.length > 0 && body.confirmDuplicate === true) {
          await tx.outbox.create({
            data: {
              aggregate: "product-card-audit",
              payload: {
                at: new Date().toISOString(),
                actor,
                action: `duplicate_override:${matches[0].id}`,
                cardId: created.id,
              },
            },
          });
        }
        return created;
      });
      return card;
    } catch (e) {
      // constraint violation (P2002 / UNIQUE) — конкурентный дубль → 409
      if (e instanceof ConflictException) throw e;
      const code =
        (e as { code?: string }).code ??
        (e as { cause?: { code?: string } }).cause?.code ??
        "";
      const isUnique =
        code === "P2002" || /UNIQUE/i.test(String((e as Error).message));
      if (isUnique) {
        throw new ConflictException({
          code: 409,
          message: `card with gtin ${body.gtin} already exists`,
          details: null,
          fieldErrors: {},
          correlationId: "",
          retryable: false,
        });
      }
      throw e;
    }
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

  async listDrafts(tenantId: string, status?: string): Promise<unknown[]> {
    // F2: по умолчанию OUT_OF_SCOPE скрыт; ?status=OUT_OF_SCOPE — отдельный список
    const where =
      status === "OUT_OF_SCOPE"
        ? { tenantId, status: "OUT_OF_SCOPE" }
        : { tenantId, status: { not: "OUT_OF_SCOPE" } };
    return this.prisma.draftProposal.findMany({
      where,
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
  async drafts(@Req() req: Request, @Query("status") status?: string) {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    return { items: await this.catalog.listDrafts(tenantId, status) };
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
    @Body()
    body: {
      gtin: string;
      attributes: Record<string, unknown>;
      confirmDuplicate?: boolean;
    }
  ) {
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const actor = (req as unknown as { actor: string }).actor;
    return this.catalog.createCard(tenantId, actor, body);
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
      throw new NotFoundException("demo endpoint disabled"); // F4: 404, не 400
    }
    const tenantId = (req as unknown as { tenantId: string }).tenantId;
    const count = await this.catalog.seedInvoice(tenantId);
    return { count };
  }
}
