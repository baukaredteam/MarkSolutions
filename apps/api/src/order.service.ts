import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { BillingService } from "./billing.service";
import { productGroupOf } from "@markflow/shared";
import type { CreateOrderDto } from "./order/order.dto";

// ORD-026: машина заказа до Queued в этом тикете.
const QUEUEABLE = ["DRAFT", "VALIDATING", "FUNDS_RESERVED", "QUEUED"] as const;

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService
  ) {}

  private async getOwnedOrder(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order || order.tenantId !== tenantId)
      // 404, не 403: 403 раскрывает существование чужого заказа (IDOR), 404 скрывает
      throw new NotFoundException("order not found");
    return order;
  }

  async create(tenantId: string, idempotencyKey: string, body: CreateOrderDto) {
    if (!idempotencyKey)
      throw new BadRequestException("Idempotency-Key header required");
    // контрактные ограничения (ADR-024): cisType=UNIT, serialNumberType=OPERATOR, isPaid=true
    if (body.cisType && body.cisType !== "UNIT") {
      throw new BadRequestException(
        `групповая маркировка не поддерживается в MVP-1 (cisType=${body.cisType})`
      );
    }
    if (body.serialNumberType && body.serialNumberType !== "OPERATOR") {
      throw new BadRequestException(
        `SELF_MADE не поддерживается в MVP-1 (serialNumberType=${body.serialNumberType})`
      );
    }
    if (!body.places || body.places < 1)
      throw new BadRequestException("places must be >= 1");
    if (!body.unitsPerPlace || body.unitsPerPlace < 1)
      throw new BadRequestException("unitsPerPlace must be >= 1");
    // C-04: businessPlaceId — int32 > 0 (площадка нанесения); -1/0/NaN → 400
    if (
      body.businessPlaceId !== undefined &&
      (!Number.isInteger(body.businessPlaceId) || body.businessPlaceId <= 0)
    ) {
      throw new BadRequestException("businessPlaceId must be a positive int32");
    }

    // карточка tenant (каталог не трогаем, ADR-023)
    const card = await this.prisma.productCard.findFirst({
      where: { id: body.cardId, tenantId, gtin: body.gtin },
    });
    if (!card) throw new NotFoundException("card not found for tenant");

    const product = body.places * body.unitsPerPlace;
    const quantity = body.quantity ?? product;
    if (quantity < 1 || quantity > product) {
      throw new BadRequestException(
        `quantity must be 1..${product} (places×unitsPerPlace)`
      );
    }

    // C-06: тариф по товарной группе карточки (activeTariff(productGroup)),
    // fallback — общий. Группа из схемы (attributes.schemaVersion → productGroup).
    const productGroup = productGroupOf(
      card.attributes as Record<string, unknown>
    );
    const tariff = await this.billing.activeTariff(productGroup);
    const pricePerCodeKZT = tariff.pricePerCodeKZT;
    const totalPrice = BigInt(quantity) * BigInt(pricePerCodeKZT);

    // Idempotency-Key = orderId: повтор → существующий заказ (AT-07)
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: { lines: true },
    });
    if (existing) {
      return {
        id: existing.id,
        number: existing.number,
        status: existing.status,
        isPaid: existing.isPaid,
        lines: existing.lines.map((l) => ({
          quantity: l.quantity,
          totalPrice: l.totalPrice.toString(),
        })),
      };
    }

    // W0-02R: ОДНА транзакция: заказ + RESERVE (CAS) + outbox; machine Draft→…→Queued.
    // Номер заказа — PG sequence (order_number_seq), tenant-агностичный.
    // Атомарный nextval() гарантирует уникальность без retry/P2002 на number.
    // Идемпотентность по idempotencyKey — P2002 ловим и возвращаем существующий.
    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        // UI-05: номер из PG sequence (W0-02R: nextval, не max+1)
        const created = await tx.order.create({
          data: {
            tenantId,
            idempotencyKey,
            cardId: card.id,
            gtin: body.gtin,
            isPaid: true,
            businessPlaceId: body.businessPlaceId ?? null, // C-04
            status: "DRAFT",
            // number omitted — assigned by PG sequence (nextval('order_number_seq'))
          },
        });
        // ORD-026: Draft → Validating → Funds Reserved → Queued
        await tx.order.update({
          where: { id: created.id },
          data: { status: "VALIDATING" },
        });
        await this.billing.reserveOn(
          tx,
          tenantId,
          created.id,
          totalPrice,
          `order ${created.id}`
        );
        await tx.order.update({
          where: { id: created.id },
          data: { status: "FUNDS_RESERVED" },
        });
        await tx.orderLine.create({
          data: {
            tenantId,
            orderId: created.id,
            cardId: card.id,
            gtin: body.gtin,
            places: body.places,
            unitsPerPlace: body.unitsPerPlace,
            quantity,
            totalPrice,
            cisType: "UNIT",
            serialNumberType: "OPERATOR",
            tariffId: tariff.id,
            pricePerCodeKZT: BigInt(pricePerCodeKZT),
          },
        });
        const queued = await tx.order.update({
          where: { id: created.id },
          data: { status: "QUEUED" },
        });
        await tx.outbox.create({
          data: {
            aggregate: "send-order-to-mpt",
            payload: {
              orderId: created.id,
              tenantId,
              gtin: body.gtin,
              quantity,
            },
          },
        });
        return queued;
      });
    } catch (e) {
      // W0-02R: business exceptions (402 insufficient funds) propagate as-is.
      if (e instanceof HttpException) throw e;
      // P2002 on idempotencyKey → return existing order (AT-07 idempotency).
      // P2002 on number is impossible with PG sequence; if it occurs, re-throw.
      const code = (e as { code?: string }).code;
      if (code === "P2002") {
        const existing = await this.prisma.order.findUnique({
          where: { idempotencyKey },
          include: { lines: true },
        });
        if (existing) {
          return {
            id: existing.id,
            number: existing.number,
            status: existing.status,
            isPaid: existing.isPaid,
            lines: existing.lines.map((l) => ({
              quantity: l.quantity,
              totalPrice: l.totalPrice.toString(),
            })),
          };
        }
      }
      throw e;
    }

    return {
      id: order.id,
      number: order.number,
      status: order.status,
      isPaid: order.isPaid,
      lines: [
        {
          quantity,
          totalPrice: totalPrice.toString(),
          cisType: "UNIT",
          serialNumberType: "OPERATOR",
        },
      ],
    };
  }

  // ORD-028: отмена до эмиссии (до Sent/READY) → RELEASE + Cancelled; после → 409
  async cancel(tenantId: string, orderId: string) {
    const order = await this.getOwnedOrder(tenantId, orderId);
    if (!QUEUEABLE.includes(order.status as (typeof QUEUEABLE)[number])) {
      throw new ConflictException({
        code: 409,
        message: `нельзя отменить заказ в статусе ${order.status} — коды уже в эмиссии`,
        details: null,
        fieldErrors: {},
        correlationId: "",
        retryable: false,
      });
    }
    if (order.status === "CANCELLED")
      return { id: orderId, status: "CANCELLED" };
    await this.billing.release(tenantId, orderId, "cancel before emission");
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: "CANCELLED" },
    });
    // отмена выигрывает гонку с поллером: нейтрализуем ещё не отправленный outbox
    const pending = await this.prisma.outbox.findMany({
      where: { aggregate: "send-order-to-mpt", status: "PENDING" },
      take: 50,
    });
    const mine = pending.filter(
      (r) => (r.payload as { orderId?: string }).orderId === orderId
    );
    for (const r of mine) {
      await this.prisma.outbox.update({
        where: { id: r.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
    }
    return { id: orderId, status: "CANCELLED" };
  }

  async list(tenantId: string) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    // UI-04: название товара для колонки «Товар» (карточка → attributes.name)
    const cardIds = [
      ...new Set(
        orders.map((o) => o.cardId).filter((c): c is string => Boolean(c))
      ),
    ];
    const cards = cardIds.length
      ? await this.prisma.productCard.findMany({
          where: { id: { in: cardIds } },
          select: { id: true, attributes: true },
        })
      : [];
    const nameById = new Map<string, string>(
      cards.map((c) => [
        c.id,
        String((c.attributes as Record<string, unknown>)?.name ?? ""),
      ])
    );
    return orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      gtin: o.gtin,
      cardName: o.cardId ? (nameById.get(o.cardId) ?? "") : "",
      quantity: o.lines.reduce((s, l) => s + l.quantity, 0),
      totalPrice: o.lines
        .reduce((s, l) => s + l.totalPrice, BigInt(0))
        .toString(),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));
  }

  async get(tenantId: string, orderId: string) {
    const order = await this.getOwnedOrder(tenantId, orderId);
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      gtin: order.gtin,
      isPaid: order.isPaid,
      lines: order.lines.map((l) => ({
        quantity: l.quantity,
        totalPrice: l.totalPrice.toString(),
        cisType: l.cisType,
        serialNumberType: l.serialNumberType,
        tariffId: l.tariffId,
        pricePerCodeKZT: l.pricePerCodeKZT.toString(),
        places: l.places,
        unitsPerPlace: l.unitsPerPlace,
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
