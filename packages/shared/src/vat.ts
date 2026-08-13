// НДС-движок (W5-07): ставка как данные (env VAT_RATE_PCT, дефолт 16 с 01.01.2026).
// Деньги в тиынах. splitVat: сумма с НДС → {sumWithoutVat, vat} до тиына.

export function vatRatePct(): number {
  return Number(process.env.VAT_RATE_PCT ?? 16);
}

export interface VatSplit {
  sumWithoutVat: bigint;
  vat: bigint;
}

// Сумма включает НДС (vatIncluded): vat = round(total * rate / (100 + rate)),
// без-НДС = total − vat. Округление в меньшую сторону от тиына не ломается (остаток ≤1).
export function splitVat(totalWithVat: bigint, ratePct: number): VatSplit {
  if (ratePct <= 0) return { sumWithoutVat: totalWithVat, vat: BigInt(0) };
  const rate = BigInt(ratePct);
  const vat = (totalWithVat * rate) / (BigInt(100) + rate);
  return { sumWithoutVat: totalWithVat - vat, vat };
}
