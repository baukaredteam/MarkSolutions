import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import {
  validateAttributes,
  autofillAttributes,
  isInList,
  type MotorOilAttributes,
} from "@markflow/shared";
import { GtinResolver } from "./gtin-resolver";

// Машина модерации карточки (CAT-013, §8.2 ТЗ):
// Draft → Validating → Submitted → In Review → Approved/Needs Correction/Rejected → Registering → Registered.
// Каждый переход пишет автора + время + комментарий в card.audit.
export const MODERATION_STATUSES = [
  "DRAFT",
  "VALIDATING",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "NEEDS_CORRECTION",
  "REJECTED",
  "REGISTERING",
  "REGISTERED",
] as const;
export type CardStatus = (typeof MODERATION_STATUSES)[number];

export interface AuditEntry {
  author: string;
  at: string;
  from: string;
  to: string;
  comment?: string;
}

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gtin: GtinResolver
  ) {}

  // Аудит перехода (CAT-013): {author, at, from, to, comment}; append, не перезапись.
  private async recordTransition(
    cardId: string,
    author: string,
    from: string,
    to: string,
    comment?: string
  ): Promise<void> {
    const card = await this.prisma.productCard.findUnique({
      where: { id: cardId },
    });
    if (!card) return;
    const list = (card.audit as unknown as AuditEntry[]) ?? [];
    const next: AuditEntry = {
      author,
      at: new Date().toISOString(),
      from,
      to,
      comment,
    };
    await this.prisma.productCard.update({
      where: { id: cardId },
      data: {
        audit: [...list, next] as unknown as never,
      },
    });
  }

  private async getCard(id: string) {
    const card = await this.prisma.productCard.findUnique({ where: { id } });
    if (!card) throw new NotFoundException("card not found");
    return card;
  }

  // Автоматизация Validating → Submitted (приемлемо):
  // ярус A (AT-03) + ТНВЭД-гейт (ADR-022) + GtinResolver (Q6).
  // Проблемы → Needs Correction (не In Review).
  private async validateForSubmit(
    cardId: string,
    actor: string
  ): Promise<{ ok: boolean; fieldErrors: Record<string, string> }> {
    const card = await this.getCard(cardId);
    const attrs = autofillAttributes(
      card.attributes as Partial<MotorOilAttributes>,
      {}
    );
    const v = validateAttributes(attrs);
    const fieldErrors: Record<string, string> = { ...(v.ok ? {} : v.errors) };

    // ТНВЭД-гейт (ADR-022): вне перечня без решения → Needs Correction
    const tnved = String(attrs.tnved ?? "") || undefined;
    if (tnved && !isInList(tnved)) {
      fieldErrors.tnved = `ТНВЭД вне перечня: ${tnved}`;
    }

    // GtinResolver: gtin обязателен для модерации
    const gtin = String(attrs.gtin ?? "") || card.gtin || undefined;
    if (gtin) {
      const res = await this.gtin.resolve(gtin);
      if (!res.ok) {
        fieldErrors.gtin = res.reason ?? "GTIN отклонён";
      }
    } else if (!fieldErrors.gtin) {
      fieldErrors.gtin = "GTIN обязателен для модерации";
    }

    if (Object.keys(fieldErrors).length > 0) {
      await this.prisma.productCard.update({
        where: { id: cardId },
        data: {
          status: "NEEDS_CORRECTION",
          fieldReasons: fieldErrors,
          // снапшот — иначе после исправления полей resubmit не сможет сверить изменения
          rejectedAttributes:
            card.attributes as unknown as Prisma.InputJsonValue,
        },
      });
      await this.recordTransition(
        cardId,
        actor,
        "VALIDATING",
        "NEEDS_CORRECTION",
        `ярус A/ТНВЭД/GtinResolver: ${Object.keys(fieldErrors).join(", ")}`
      );
      return { ok: false, fieldErrors };
    }
    return { ok: true, fieldErrors };
  }

  // Тенант отправляет карточку на модерацию (Draft/Needs Correction → Validating → Submitted).
  // Повторная отправка без исправления помеченных полей = 400 (CAT-013).
  async submitCard(tenantId: string, cardId: string, actor: string) {
    const card = await this.getCard(cardId);
    if (card.tenantId !== tenantId)
      throw new NotFoundException("card not found");
    if (card.status !== "DRAFT" && card.status !== "NEEDS_CORRECTION") {
      throw new BadRequestException(
        `cannot submit card in status ${card.status} (Draft|Needs Correction only)`
      );
    }

    // повторная отправка после реджекта: если помеченные поля не исправлены → 400
    const reasons = (card.fieldReasons as Record<string, string>) ?? {};
    if (Object.keys(reasons).length > 0) {
      const rejectedSnapshot = card.rejectedAttributes as Record<
        string,
        unknown
      > | null;
      const attrs = autofillAttributes(
        card.attributes as Partial<MotorOilAttributes>,
        {}
      ) as unknown as Record<string, unknown>;
      const unfixed = Object.keys(reasons).filter((f) => {
        // поле неисправлено, если его значение не изменилось с момента реджекта
        // (отсутствие в снапшоте = пустое значение на тот момент)
        const snapValue = rejectedSnapshot ? rejectedSnapshot[f] : undefined;
        return String(attrs[f] ?? "") === String(snapValue ?? "");
      });
      if (unfixed.length > 0) {
        throw new BadRequestException({
          code: 400,
          message: "mark fields not fixed",
          details: { unfixed },
          fieldErrors: unfixed.reduce(
            (acc, f) => ({ ...acc, [f]: reasons[f] }),
            {}
          ),
          correlationId: "",
          retryable: false,
        });
      }
    }

    // Draft/Needs Correction → Validating → (auto) → Submitted / Needs Correction
    const fromStatus = card.status;
    await this.prisma.productCard.update({
      where: { id: cardId },
      data: { status: "VALIDATING" },
    });
    await this.recordTransition(
      cardId,
      actor,
      fromStatus,
      "VALIDATING",
      "карточка на автоматической проверке"
    );

    const check = await this.validateForSubmit(cardId, actor);
    if (!check.ok) {
      return {
        id: cardId,
        status: "NEEDS_CORRECTION",
        fieldErrors: check.fieldErrors,
      };
    }
    await this.prisma.productCard.update({
      where: { id: cardId },
      data: {
        status: "SUBMITTED",
        fieldReasons: {},
        rejectedAttributes: Prisma.JsonNull,
      },
    });
    await this.recordTransition(
      cardId,
      actor,
      "VALIDATING",
      "SUBMITTED",
      "отправлена в очередь модерации"
    );
    return { id: cardId, status: "SUBMITTED" };
  }

  // Очередь модерации: Submitted (и In Review) across all tenants; ?tenantId= фильтр.
  async queue(status?: string, tenantId?: string) {
    const where: Record<string, unknown> = {
      status: status ? String(status) : { in: ["SUBMITTED", "IN_REVIEW"] },
    };
    if (tenantId) where.tenantId = tenantId;
    const cards = await this.prisma.productCard.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { tenant: { select: { name: true, bin: true } } },
    });
    return cards.map((c) => ({
      id: c.id,
      status: c.status,
      gtin: c.gtin,
      tenantId: c.tenantId,
      tenant: c.tenant,
      attributes: c.attributes,
      fieldReasons: c.fieldReasons,
      audit: c.audit,
      version: c.version,
      updatedAt: c.updatedAt,
    }));
  }

  private async transition(
    card: { id: string; status: string },
    to: CardStatus,
    actor: string,
    comment?: string
  ) {
    const from = card.status;
    await this.prisma.productCard.update({
      where: { id: card.id },
      data: { status: to },
    });
    await this.recordTransition(card.id, actor, from, to, comment);
  }

  // Оператор одобряет: In Review → Approved → (далее Registering через NKT, OutboxPoller).
  // Идемпотентно: повторный approve на APPROVED не создаёт вторую регистрацию.
  async approve(cardId: string, actor: string) {
    const card = await this.getCard(cardId);
    if (!["SUBMITTED", "IN_REVIEW", "APPROVED"].includes(card.status)) {
      throw new BadRequestException(
        `cannot approve card in status ${card.status}`
      );
    }
    if (card.status === "APPROVED") {
      // outbox-событие уже создано при первом approve — повторно не дублируем
      return { id: cardId, status: "APPROVED" };
    }
    if (card.status === "SUBMITTED") {
      await this.transition(card, "IN_REVIEW", actor, "оператор взял в работу");
    }
    const reviewed = await this.getCard(cardId);
    await this.transition(reviewed, "APPROVED", actor, "одобрена модератором");
    // создаём outbox-событие для асинхронной регистрации в НКТ
    await this.prisma.outbox.create({
      data: {
        aggregate: "nkt-register",
        payload: {
          cardId,
          gtin: card.gtin,
          tenantId: card.tenantId,
        },
      },
    });
    return { id: cardId, status: "APPROVED" };
  }

  // Оператор отклоняет: обязательная причина на уровне полей → Needs Correction.
  async reject(
    cardId: string,
    actor: string,
    fieldReasons: Record<string, string>
  ) {
    const card = await this.getCard(cardId);
    if (!["SUBMITTED", "IN_REVIEW"].includes(card.status)) {
      throw new BadRequestException(
        `cannot reject card in status ${card.status}`
      );
    }
    if (!fieldReasons || Object.keys(fieldReasons).length === 0) {
      throw new BadRequestException("fieldReasons are required for rejection");
    }
    if (card.status === "SUBMITTED") {
      await this.transition(card, "IN_REVIEW", actor, "оператор взял в работу");
    }
    await this.prisma.productCard.update({
      where: { id: cardId },
      data: {
        status: "NEEDS_CORRECTION",
        fieldReasons,
        // снапшот атрибутов на момент реджекта — для проверки «исправлены ли поля» при resubmit
        rejectedAttributes: card.attributes as unknown as Prisma.InputJsonValue,
      },
    });
    await this.recordTransition(
      cardId,
      actor,
      "IN_REVIEW",
      "NEEDS_CORRECTION",
      `причины: ${JSON.stringify(fieldReasons)}`
    );
    return { id: cardId, status: "NEEDS_CORRECTION", fieldReasons };
  }
}
