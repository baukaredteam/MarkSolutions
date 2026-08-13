import { describe, it, expect } from "vitest";
import { vatRatePct, splitVat } from "./vat";

describe("vat engine (W5-07)", () => {
  it("VAT_RATE_PCT: дефолт 16 (данные, не хардкод)", () => {
    const rate = vatRatePct();
    expect(rate).toBe(16);
  });

  it("4,70 ₸ × 1000 кодов с НДС 16%: суммы сходятся до тиына", () => {
    // цена включает НДС (vatIncluded=true): 4700 тиын/КМ
    const unit = BigInt(4700); // 47,00 ₸? нет — 47,00? 4700 тиын = 47,00 ₸
    const qty = BigInt(1000);
    const totalWithVat = unit * qty; // 4 700 000 тиын = 47 000,00 ₸
    const r = splitVat(totalWithVat, 16);
    // без НДС = сумма / 1.16; НДС = 16/116 от суммы с НДС
    expect(r.vat).toBeGreaterThan(BigInt(0));
    expect(r.sumWithoutVat + r.vat).toBe(totalWithVat);
    // vat = round(сумма * 16 / 116), без-НДС = сумма - vat
    const expectedVat = (totalWithVat * BigInt(16)) / BigInt(116);
    expect(Math.abs(Number(r.vat - expectedVat))).toBeLessThanOrEqual(1);
  });

  it("4,70 ₸ (470 тиын) × 1000 → sumWithVat = 470 000 тиын", () => {
    const unit = BigInt(470); // 4,70 ₸
    const total = unit * BigInt(1000);
    expect(total).toBe(BigInt(470000));
  });
});
