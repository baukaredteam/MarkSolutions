// Порты интеграций модерации (T3, Q5/Q6).
// IG/GS1 (проверка GTIN) и НКТ (регистрация продукта) — моки для MVP.
import { verifyGtinMod10 } from "@markflow/shared";

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
