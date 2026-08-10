import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { BillingService } from "./billing.service";

// ORD-026: машина заказа до Queued в этом тикете.
// Draft → Validating → Funds Reserved → Queued (Sent/Processing/Completed — тикет 03).
const QUEUEABLE = ["DRAFT", "VALIDATING", "FUNDS_RESERVED", "QUEUED"] as const;

interface CreateOrderInput {
  cardId: string;
  gtin: string;
  places: number;
  unitsPerPlace: number;
  quantity?: number;
  cisType?: string;
  serialNumberType?: string;
}

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

  async create(
    tenantId: string,
    idempotencyKey: string,
    body: CreateOrderInput
  ) {
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

    // активный тариф (данные, не хардкод)
    const tariff = await this.billing.activeTariff();
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
        status: existing.status,
        isPaid: existing.isPaid,
        lines: existing.lines.map((l) => ({
          quantity: l.quantity,
          totalPrice: l.totalPrice.toString(),
        })),
      };
    }

    // ОДНА транзакция: заказ + RESERVE (CAS) + outbox; machine Draft→…→Queued
    let order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            tenantId,
            idempotencyKey,
            cardId: card.id,
            gtin: body.gtin,
            isPaid: true,
            status: "DRAFT",
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
        // финал create = QUEUED (вариант b: статус — синхронный финал create,
        // без лишнего SELECT после транзакции)
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
      // конкурентный повтор того же Idempotency-Key: unique(idempotencyKey) → P2002.
      // Возвращаем существующий заказ (AT-07), не 500.
      if ((e as { code?: string }).code === "P2002") {
        const existing = await this.prisma.order.findUnique({
          where: { idempotencyKey },
          include: { lines: true },
        });
        if (existing) {
          return {
            id: existing.id,
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
    if (!order) throw new NotFoundException("order not found");

    return {
      id: order.id,
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
    return { id: orderId, status: "CANCELLED" };
  }

  async list(tenantId: string) {
    const orders = await this.prisma.order.findMany({
      where: { tenantId },
      include: { lines: true },
      orderBy: { createdAt: "desc" },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      gtin: o.gtin,
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
