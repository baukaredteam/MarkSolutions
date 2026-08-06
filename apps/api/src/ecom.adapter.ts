// Порт 1ecom (ADR-004): проверка контрагента. Реальный — по договору; мок — ручной режим.
export const ECOM_ADAPTER = "ECOM_ADAPTER";

export interface EcomVerification {
  status: "PENDING_EXTERNAL" | "VERIFIED" | "REJECTED";
}

export interface IEcomAdapter {
  verify(bin: string): Promise<EcomVerification>;
  resolve(bin: string, decision: "approve" | "reject"): boolean;
}

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
}
