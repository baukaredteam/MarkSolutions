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
  ForbiddenException,
  Injectable,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";
import { ModerationService } from "./moderation.service";
import { Roles } from "./guards";
import { READ_ROLES } from "./guards";
import { KMS_ADAPTER, IKmsAdapter } from "./kms.adapter";
import { Inject } from "@nestjs/common";
import { activeScopeOf, scopeWhere } from "./scoped-repository";
import type { LegalEntityScope } from "./scope";
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
  source?: string;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // UI-04: tenant-список карточек (id/name/gtin/ntin/status/updatedAt), sort desc
  async listCards(scope: LegalEntityScope) {
    const tenantId = scope.organizationId;
    const rows = await this.prisma.productCard.findMany({
      where: {
        tenantId,
        legalEntityId: scope.legalEntityId,
        status: { not: "ARCHIVED" },
      },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((r) => {
      const attrs = (r.attributes as Record<string, unknown>) ?? {};
      return {
        id: r.id,
        name: attrs.name ?? null,
        gtin: r.gtin,
        ntin: r.ntin ?? null,
        status: r.status,
        updatedAt: r.updatedAt,
      };
    });
  }

  // UI-04: карточка по id (attributes + audit + status); чужой tenant → 404
  async getCard(scope: LegalEntityScope, cardId: string) {
    const card = await this.prisma.productCard.findFirst({
      where: { id: cardId, ...scopeWhere(scope) },
    });
    if (!card) throw new NotFoundException("card not found");
    return {
      id: card.id,
      gtin: card.gtin,
      ntin: card.ntin ?? null,
      status: card.status,
      attributes: card.attributes,
      audit: card.audit ?? [],
      updatedAt: card.updatedAt,
    };
  }

  async createCard(
    scope: LegalEntityScope,
    actor: string,
    body: {
      gtin: string;
      attributes: Record<string, unknown>;
      confirmDuplicate?: boolean;
    }
  ): Promise<unknown> {
    const tenantId = scope.organizationId;
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
            legalEntityId: scope.legalEntityId,
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

  async createDraft(scope: LegalEntityScope, row: DraftRow): Promise<unknown> {
    const tenantId = scope.organizationId;
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
        legalEntityId: scope.legalEntityId,
        source: row.source ?? "invoice",
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

  async listDrafts(
    scope: LegalEntityScope,
    status?: string
  ): Promise<unknown[]> {
    // F2: по умолчанию OUT_OF_SCOPE скрыт; ?status=OUT_OF_SCOPE — отдельный список
    const where =
      status === "OUT_OF_SCOPE"
        ? { ...scopeWhere(scope), status: "OUT_OF_SCOPE" }
        : { ...scopeWhere(scope), status: { not: "OUT_OF_SCOPE" } };
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
    scope: LegalEntityScope,
    id: string,
    actor: string,
    newTnved: string
  ): Promise<unknown> {
    if (!isInList(newTnved))
      throw new BadRequestException(`tnved not in list: ${newTnved}`);
    const draft = await this.prisma.draftProposal.findFirst({
      where: { id, ...scopeWhere(scope) },
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
    scope: LegalEntityScope,
    id: string,
    actor: string
  ): Promise<unknown> {
    const draft = await this.prisma.draftProposal.findFirst({
      where: { id, ...scopeWhere(scope) },
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
    scope: LegalEntityScope,
    id: string,
    actor: string
  ): Promise<unknown> {
    const draft = await this.prisma.draftProposal.findFirst({
      where: { id, ...scopeWhere(scope) },
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

  async seedInvoice(scope: LegalEntityScope): Promise<number> {
    // читаем фикстуру (38 реальных + 2 demo)
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const rows = JSON.parse(
      readFileSync(
        join(__dirname, "..", "..", "..", "fixtures", "invoice-38.json"),
        "utf8"
      )
    ) as DraftRow[];
    for (const r of rows) {
      await this.createDraft(scope, { ...r, demo: r.demo ?? false });
    }
    return rows.length;
  }
}

@Controller("products")
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly moderation: ModerationService
  ) {}

  // Роль OPERATOR не имеет tenant — tenant-scoped эндпоинты для него закрыты (403),
  // кроме модерации (CAT-013).
  private scopeOf(req: Request): LegalEntityScope {
    return activeScopeOf(req);
  }

  private tenantOf(req: Request): string {
    const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
    if (!tenantId) throw new ForbiddenException("tenant required");
    return tenantId;
  }

  @Roles(...READ_ROLES)
  @Get("cards")
  async cards(@Req() req: Request) {
    return { items: await this.catalog.listCards(this.scopeOf(req)) };
  }

  @Roles(...READ_ROLES)
  @Get("cards/:id")
  async card(@Req() req: Request, @Param("id") id: string) {
    return this.catalog.getCard(this.scopeOf(req), id);
  }

  @Roles(...READ_ROLES)
  @Get("drafts")
  async drafts(@Req() req: Request, @Query("status") status?: string) {
    return { items: await this.catalog.listDrafts(this.scopeOf(req), status) };
  }

  @Roles("admin", "manager")
  @HttpCode(201)
  @Post("drafts/import")
  async importDrafts(@Req() req: Request, @Body() body: { rows: DraftRow[] }) {
    const scope = this.scopeOf(req);
    // MVP: синхронно создаём (OutboxPoller-асинхронность — след. итерация),
    // но возвращаем jobId для совместимости с acceptance.
    for (const row of body.rows) await this.catalog.createDraft(scope, row);
    return { jobId: `job-${Date.now()}`, created: body.rows.length };
  }

  @Roles("admin", "manager")
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
    const scope = this.scopeOf(req);
    const actor = (req as unknown as { actor: string }).actor;
    return this.catalog.createCard(scope, actor, body);
  }

  @Roles("admin", "manager")
  @HttpCode(200)
  @Post("drafts/:id/fix-tnved")
  async fixTnved(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { tnved: string }
  ) {
    return this.catalog.fixTnved(
      this.scopeOf(req),
      id,
      (req as unknown as { actor: string }).actor,
      body.tnved
    );
  }

  @Roles("admin", "manager")
  @HttpCode(200)
  @Post("drafts/:id/out-of-scope")
  async outOfScope(@Req() req: Request, @Param("id") id: string) {
    return this.catalog.outOfScope(
      this.scopeOf(req),
      id,
      (req as unknown as { actor: string }).actor
    );
  }

  @Roles("admin", "manager")
  @HttpCode(200)
  @Post("drafts/:id/submit")
  async submitDraft(@Req() req: Request, @Param("id") id: string) {
    return this.catalog.submitDraft(
      this.scopeOf(req),
      id,
      (req as unknown as { actor: string }).actor
    );
  }

  // CAT-013: tenant отправляет карточку на модерацию (Draft/Needs Correction → Validating → Submitted).
  @Roles("admin", "manager")
  @HttpCode(200)
  @Post("cards/:id/submit")
  async submitCard(@Req() req: Request, @Param("id") id: string) {
    return this.moderation.submitCard(
      this.scopeOf(req).organizationId,
      id,
      (req as unknown as { actor: string }).actor
    );
  }
}

@Controller("demo")
export class DemoController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    @Inject(KMS_ADAPTER) private readonly kms: IKmsAdapter
  ) {}

  @HttpCode(201)
  @Post("seed-invoice")
  async seed(@Req() req: Request) {
    if (process.env.DEMO_ENABLED !== "true") {
      throw new NotFoundException("demo endpoint disabled"); // F4: 404, не 400
    }
    const count = await this.catalog.seedInvoice(activeScopeOf(req));
    return { count };
  }

  // W4-06: демо-история для дашборда одним кликом (идемпотентно).
  // 2 APPLIED-кода (a), COMPLETED-заказ со сдвигом updatedAt −24 дня (b),
  // ImportDocument EXPECTED (d), outbox FAILED (e), WithdrawalDocument WRITE_OFF.
  @HttpCode(201)
  @Post("w4-seed")
  async w4Seed(@Req() req: Request) {
    if (process.env.DEMO_ENABLED !== "true") {
      throw new NotFoundException("demo endpoint disabled");
    }
    // ADR-027: демо-сев идёт от валидированного active scope, не от «голого» tenantId.
    const scope = activeScopeOf(req);
    return this.runW4Seed(scope.organizationId, scope.legalEntityId);
  }

  private async runW4Seed(tenantId: string, legalEntityId: string) {
    const existingApplied = await this.prisma.codeVault.count({
      where: { tenantId, status: "APPLIED" },
    });
    if (existingApplied < 2) {
      const order = await this.prisma.order.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "asc" },
      });
      const orderId = order?.id ?? "demo-w4-order";
      if (!order) {
        await this.prisma.order.create({
          data: {
            id: orderId,
            tenantId,
            legalEntityId, // ADR-027: NOT NULL на Order
            status: "COMPLETED",
            idempotencyKey: `w4-seed-order-${tenantId}`,
          },
        });
      }
      const { ciphertext } = await this.kms.encrypt(
        Buffer.from(
          JSON.stringify({ serial: "9000001", ai91: null, ai92: null })
        ),
        { organizationId: tenantId, legalEntityId, objectId: orderId }
      );
      for (let i = 0; i < 2; i++) {
        await this.prisma.codeVault.create({
          data: {
            tenantId,
            legalEntityId,
            orderId,
            gtin: "04014835723399",
            mask: `04014835723399:90…0${i + 1}`,
            status: "APPLIED",
            ciphertext: ciphertext.toString("base64"),
          },
        });
      }
    }

    // b) сдвинуть updatedAt COMPLETED-заказа на 24 дня назад (дедлайн ≤7 суток)
    const completed = await this.prisma.order.findFirst({
      where: { tenantId, status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] } },
      orderBy: { createdAt: "desc" },
    });
    if (completed) {
      await this.prisma.order.update({
        where: { id: completed.id },
        data: { updatedAt: new Date(Date.now() - 24 * 86400000) },
      });
    }

    // d) ImportDocument EXPECTED (если нет)
    const expectedDt = await this.prisma.importDocument.count({
      where: { tenantId, status: "EXPECTED" },
    });
    if (expectedDt === 0) {
      await this.prisma.importDocument.create({
        data: {
          tenantId,
          legalEntityId,
          orderId: "demo-w4-order",
          customsDate: "",
          customsNumber: `EXPECTED-${tenantId.slice(0, 6)}`,
          status: "EXPECTED",
        },
      });
    }

    // e) outbox mpt-order-timeout FAILED (если нет, tenant-scoped по payload)
    const failedTasks = await this.prisma.outbox.findMany({
      where: { aggregate: "mpt-order-timeout", status: "FAILED" },
      select: { payload: true },
    });
    const hasForTenant = failedTasks.some(
      (t) => (t.payload as { tenantId?: string }).tenantId === tenantId
    );
    if (!hasForTenant) {
      await this.prisma.outbox.create({
        data: {
          aggregate: "mpt-order-timeout",
          status: "FAILED",
          payload: { orderId: "demo-w4-order", tenantId, reason: "demo task" },
        },
      });
    }

    // WithdrawalDocument WRITE_OFF для демо-сценария (если нет)
    const wd = await this.prisma.withdrawalDocument.count({
      where: { tenantId },
    });
    if (wd === 0) {
      await this.prisma.withdrawalDocument.create({
        data: {
          tenantId,
          legalEntityId,
          codes: ["demo-code-1"],
          withdrawalType: "WRITE_OFF",
          withdrawalReason: "DEFECT",
          status: "SUCCESS",
          submittedAt: new Date(),
        },
      });
    }

    return { ok: true };
  }
}
