// Порт 1ecom (ADR-004): проверка контрагента. Реальный — по договору; мок — ручной режим.
export const ECOM_ADAPTER = "ECOM_ADAPTER";

export interface EcomVerification {
  status: "PENDING_EXTERNAL" | "VERIFIED" | "REJECTED";
}

// W5-01: товары из 1ecom (мок — 8 позиций с GTIN/ТНВЭД/наименованием)
export interface EcomProduct {
  gtin: string;
  tnved: string;
  name: string;
  brand?: string;
  sae?: string;
  volumeL?: number;
}

export interface IEcomAdapter {
  verify(bin: string): Promise<EcomVerification>;
  resolve(bin: string, decision: "approve" | "reject"): boolean;
  listProducts(): Promise<EcomProduct[]>;
}

// Мок-товары 1ecom: моторные масла (GTIN 14 цифр, ТНВЭД в перечне CATALOG-MM)
const MOCK_PRODUCTS: EcomProduct[] = [
  { gtin: "04014835723399", tnved: "2710198200", name: "Castrol EDGE 0W-20 C5", brand: "Castrol", sae: "0W-20", volumeL: 4 },
  { gtin: "04014835723405", tnved: "2710198200", name: "Castrol EDGE 5W-30", brand: "Castrol", sae: "5W-30", volumeL: 4 },
  { gtin: "04014835723412", tnved: "2710198200", name: "Castrol MAGNATEC 5W-30", brand: "Castrol", sae: "5W-30", volumeL: 4 },
  { gtin: "04014835723429", tnved: "2710198200", name: "Castrol GTX 10W-40", brand: "Castrol", sae: "10W-40", volumeL: 4 },
  { gtin: "04014835723436", tnved: "2710198200", name: "RAVENOL HCL 5W-30", brand: "RAVENOL", sae: "5W-30", volumeL: 4 },
  { gtin: "04014835723443", tnved: "2710198200", name: "RAVENOL VSI 5W-30", brand: "RAVENOL", sae: "5W-30", volumeL: 4 },
  { gtin: "04014835723450", tnved: "3403191000", name: "RAVENOL ATF T-IV", brand: "RAVENOL", sae: "T-IV", volumeL: 1 },
  { gtin: "04014835723467", tnved: "2710198200", name: "Mannol Energy 5W-40", brand: "Mannol", sae: "5W-40", volumeL: 4 },
];

// MockEcomAdapter: первый вызов → Pending External, повторный (retry) → VERIFIED.
// Ручной режим оператора (ADR-004): resolve() завершает pending-проверку.
export class MockEcomAdapter implements IEcomAdapter {
  private attempts = new Map<string, number>();
  private resolved = new Set<string>();

  async verify(bin: string): Promise<EcomVerification> {
    if (this.resolved.has(bin)) return { status: "VERIFIED" };
    const n = (this.attempts.get(bin) ?? 0) + 1;
    this.attempts.set(bin, n);
    // retry (повторный вызов) → VERIFIED; первый → PENDING_EXTERNAL
    return n > 1 ? { status: "VERIFIED" } : { status: "PENDING_EXTERNAL" };
  }

  resolve(bin: string, decision: "approve" | "reject"): boolean {
    if (!this.attempts.has(bin)) return false;
    if (decision === "approve") this.resolved.add(bin);
    return true;
  }

  async listProducts(): Promise<EcomProduct[]> {
    return MOCK_PRODUCTS;
  }
}
