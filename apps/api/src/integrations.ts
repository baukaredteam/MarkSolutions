// Порты интеграций модерации (T3, Q5/Q6) + симулятор ИС МПТ (W3, ADR-005/024).
import { verifyGtinMod10 } from "@markflow/shared";
import { PrismaService } from "./prisma.service";
import { Injectable } from "@nestjs/common";

// ---- IG/GS1: слой 2 GtinResolver ----
export const IGS1_ADAPTER = "IGS1_ADAPTER";

export type Gs1VerificationStatus = "PENDING_REAL" | "REJECTED";

export interface IGs1Adapter {
  verify(gtin: string): Promise<{ status: Gs1VerificationStatus }>;
}

// Мок: валидный mod10 → PENDING_REAL, невалидный → REJECTED (Q6).
export class MockGs1Adapter implements IGs1Adapter {
  async verify(gtin: string): Promise<{ status: Gs1VerificationStatus }> {
    return {
      status: verifyGtinMod10(gtin) ? "PENDING_REAL" : "REJECTED",
    } as const;
  }
}

// ---- НКТ (Q5): submitProduct + getStatus ----
export const NKT_ADAPTER = "NKT_ADAPTER";

export interface NktProductInput {
  gtin: string;
  brand?: string;
  name?: string;
  tnved?: string;
  // тест-хук: 'reject' | 'hang' форсирует поведение мока НКТ
  nktResult?: "reject" | "hang";
}

export interface NktSubmitResult {
  ref: string;
}

export type NktStatusResult =
  | { status: "REGISTERED"; ntin: string; gtin: string }
  | { status: "REJECTED"; fieldErrors: Record<string, string> }
  | { status: "PROCESSING" };

export interface INktAdapter {
  submitProduct(input: NktProductInput): Promise<NktSubmitResult>;
  getStatus(ref: string): Promise<NktStatusResult>;
}

interface NktEntry {
  input: NktProductInput;
  createdAt: number;
}

// Мок НКТ: продукт уходит в Registering → через SLA (NKT_SLA_MS, по умолчанию 3с)
// становится Registered. Если в атрибутах nktResult='reject' — отказ с fieldErrors.
// Registration Failed → Needs Correction (CAT-013).
export class MockNktAdapter implements INktAdapter {
  private entries = new Map<string, NktEntry>();
  private readonly slaMs = Number(process.env.NKT_SLA_MS ?? 3000);

  async submitProduct(input: NktProductInput): Promise<NktSubmitResult> {
    const ref = `nkt-${input.gtin}-${Date.now()}`;
    this.entries.set(ref, { input, createdAt: Date.now() });
    return { ref };
  }

  async getStatus(ref: string): Promise<NktStatusResult> {
    const entry = this.entries.get(ref);
    if (!entry) return { status: "PROCESSING" };
    if (Date.now() - entry.createdAt < this.slaMs)
      return { status: "PROCESSING" };
    const reject = entry.input.nktResult;
    if (reject === "reject") {
      return {
        status: "REJECTED",
        fieldErrors: {
          brand: "бренд не подтверждён НКТ",
          name: "имя не подтверждено",
        },
      };
    }
    if (reject === "hang") {
      // вечное PROCESSING — для теста таймаута (NKT_TIMEOUT_MS → FAILED, ID-017)
      return { status: "PROCESSING" };
    }
    return {
      status: "REGISTERED",
      ntin: `0${entry.input.gtin}001`,
      gtin: entry.input.gtin,
    };
  }
}

// ---- ИС МПТ (W3, ADR-005): порт по CONTRACT-IS-MPT.md ----
export const MPT_ADAPTER = "MPT_ADAPTER";

export type MptOrderStatus =
  "CREATED" | "PENDING" | "READY" | "REJECTED" | "CLOSED";

export interface MptOrderInput {
  orderId: string; // Idempotency-Key (внутренний заказ)
  tenantId: string;
  gtin: string;
  quantity: number;
  serialNumberType: "OPERATOR";
  cisType: "UNIT";
  isPaid: boolean;
}

export interface MptCodeView {
  gtin: string;
  serial: string;
  ai91: string | null;
  ai92: string | null;
  form: "base" | "extended";
}

export interface IMptAdapter {
  createOrder(input: MptOrderInput): Promise<{ status: MptOrderStatus }>;
  getOrder(orderId: string): Promise<{
    status: MptOrderStatus;
    quantity: number;
  }>;
  getCodes(orderId: string): Promise<{ codes: MptCodeView[] }>;
  submitUtilisation(input: {
    tenantId: string;
    sntins: string[];
    businessPlaceId: number;
    releaseType: string;
    expirationDate: string;
    productionDate: string;
    manufacturerCountry: string;
  }): Promise<{
    reportId: string;
    status: "IN_PROCESS" | "ERROR";
    rejectReason?: string;
  }>;
  getUtilisation(reportId: string): Promise<{
    status: "IN_PROCESS" | "SUCCESS" | "ERROR";
    rejectReason?: string;
  }>;
}

// Симулятор ИС МПТ (W3): stateless — статус = f(now, createdAt, SIM_MPT_EMISSION_MS).
// Коды генерируются ОДИН раз при первом переходе в READY и сохраняются.
// Без setTimeout/фоновых таймеров (рестарт не теряет статусы).
@Injectable()
export class MockMptAdapter implements IMptAdapter {
  constructor(private readonly prisma: PrismaService) {}

  private get emissionMs(): number {
    return Number(process.env.SIM_MPT_EMISSION_MS ?? 45000);
  }

  // идемпотентно по orderId: повтор POST /api/orders возвращает существующий заказ
  async createOrder(input: MptOrderInput): Promise<{ status: MptOrderStatus }> {
    const existing = await this.prisma.mptOrder.findUnique({
      where: { externalId: input.orderId },
    });
    if (existing) {
      return { status: this.statusOf(existing) };
    }
    await this.prisma.mptOrder.create({
      data: {
        tenantId: input.tenantId,
        externalId: input.orderId,
        gtin: input.gtin,
        quantity: input.quantity,
        status: "CREATED",
      },
    });
    return { status: "CREATED" };
  }

  async getOrder(orderId: string): Promise<{
    status: MptOrderStatus;
    quantity: number;
  }> {
    const order = await this.prisma.mptOrder.findUnique({
      where: { externalId: orderId },
    });
    if (!order) return { status: "CREATED", quantity: 0 };
    const status = this.statusOf(order);
    // первый переход в READY → эмитировать коды (один раз)
    if (status === "READY" && order.status !== "READY") {
      await this.emitCodes(order.id, order.gtin, order.quantity);
    }
    await this.prisma.mptOrder.update({
      where: { id: order.id },
      data: { status },
    });
    return { status, quantity: order.quantity };
  }

  async getCodes(orderId: string): Promise<{ codes: MptCodeView[] }> {
    const order = await this.prisma.mptOrder.findUnique({
      where: { externalId: orderId },
      include: { codes: true },
    });
    // только READY/CLOSED (CONTRACT-IS-MPT)
    if (!order || !["READY", "CLOSED"].includes(this.statusOf(order))) {
      return { codes: [] };
    }
    if (order.status !== "READY" && this.statusOf(order) === "READY") {
      await this.emitCodes(order.id, order.gtin, order.quantity);
    }
    const fresh = await this.prisma.mptOrder.findUnique({
      where: { externalId: orderId },
      include: { codes: true },
    });
    return {
      codes: (fresh?.codes ?? []).map((c) => ({
        gtin: c.gtin,
        serial: c.serial,
        ai91: c.ai91,
        ai92: c.ai92,
        form: c.form as "base" | "extended",
      })),
    };
  }

  // статус из createdAt + конфиг (stateless)
  private statusOf(order: { status: string; createdAt: Date }): MptOrderStatus {
    if (order.status === "REJECTED" || order.status === "CLOSED")
      return order.status as MptOrderStatus;
    const age = Date.now() - order.createdAt.getTime();
    if (age >= this.emissionMs) return "READY";
    return "PENDING";
  }

  // генерация кодов один раз: serial уникальны по (gtin) между заказами (OPERATOR)
  private async emitCodes(
    mptOrderId: string,
    gtin: string,
    quantity: number
  ): Promise<void> {
    const count = await this.prisma.mptCode.count({ where: { mptOrderId } });
    if (count > 0) return; // уже сгенерированы — идемпотентно
    // мок-шов для теста расхождения количества: gtin с маркером "999999" → quantity−1 кодов
    let effective = quantity;
    if (gtin.includes("999999") && quantity > 1) effective = quantity - 1;
    // serial уникальны ГЛОБАЛЬНО (не только по gtin): исключаем коллизии between orders
    const prev = await this.prisma.mptCode.findFirst({
      orderBy: { serial: "desc" },
    });
    let seed = prev ? Number(prev.serial) + 1 : 1;
    const rows = [];
    for (let i = 0; i < effective; i++) {
      const serial = String(seed++).padStart(7, "0");
      rows.push({
        mptOrderId,
        gtin,
        serial,
        ai91: null,
        ai92: null,
        form: "base" as const,
      });
    }
    await this.prisma.mptCode.createMany({ data: rows });
  }

  // ---- Нанесение (п.26, CONTRACT-IS-MPT) ----
  // sntins — это NTIN-идентификаторы КМ. В симуляторе сверяем с serial кодов (мок).
  private get utilSlaMs(): number {
    return Number(process.env.UTIL_SLA_MS ?? 3000);
  }

  async submitUtilisation(input: {
    tenantId: string;
    sntins: string[];
    businessPlaceId: number;
    releaseType: string;
    expirationDate: string;
    productionDate: string;
    manufacturerCountry: string;
  }): Promise<{
    reportId: string;
    status: "IN_PROCESS" | "ERROR";
    rejectReason?: string;
  }> {
    // неизвестный код (serial не в MptCode) или уже нанесённый (used) → report сразу ERROR
    let invalid: string | null = null;
    for (const sntin of input.sntins) {
      const code = await this.prisma.mptCode.findFirst({
        where: { serial: sntin },
      });
      if (!code) {
        invalid = `unknown code: ${sntin}`;
        break;
      }
      if (code.used) {
        invalid = `code already used: ${sntin}`;
        break;
      }
    }
    const reportId = `util-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await this.prisma.mptUtilisation.create({
      data: {
        reportId,
        tenantId: input.tenantId,
        sntins: input.sntins,
        releaseType: input.releaseType,
        expirationDate: input.expirationDate,
        productionDate: input.productionDate,
        manufacturerCountry: input.manufacturerCountry,
        status: invalid ? "ERROR" : "IN_PROCESS",
        rejectReason: invalid ?? null,
      },
    });
    return invalid
      ? { reportId, status: "ERROR" as const, rejectReason: invalid }
      : { reportId, status: "IN_PROCESS" as const };
  }

  async getUtilisation(reportId: string): Promise<{
    status: "IN_PROCESS" | "SUCCESS" | "ERROR";
    rejectReason?: string;
  }> {
    const report = await this.prisma.mptUtilisation.findUnique({
      where: { reportId },
    });
    if (!report) return { status: "ERROR", rejectReason: "report not found" };
    if (report.status === "ERROR")
      return {
        status: "ERROR",
        rejectReason: report.rejectReason ?? undefined,
      };
    // IN_PROCESS → SUCCESS после SLA; помечаем коды нанесёнными (used=true)
    const age = Date.now() - report.createdAt.getTime();
    if (age >= this.utilSlaMs) {
      if (report.status !== "SUCCESS") {
        await this.prisma.mptCode.updateMany({
          where: { serial: { in: report.sntins as string[] } },
          data: { used: true },
        });
        await this.prisma.mptUtilisation.update({
          where: { id: report.id },
          data: { status: "SUCCESS" },
        });
      }
      return { status: "SUCCESS" };
    }
    return { status: "IN_PROCESS" };
  }
}
