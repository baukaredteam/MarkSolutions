// Форматирование тенге (KZT) по казахстанскому стандарту:
// «100 ₸», «80 000,00 ₸» — пробел между числом и символом ₸.

// W5-07 (ADR-016 апдейт): деньги — BigInt в тиынах (минорные, 1 ₸ = 100 тиын).
// formatTenge(тиыны) → «4,70 ₸». formatKzt — прежний формат целых тенге (устаревший).

export function formatKzt(amount: bigint | string | number): string {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  const integer = Math.trunc(n)
    .toLocaleString("ru-RU")
    .replace(/\u00a0/g, " ");
  return `${integer},00 ₸`;
}

// W5-07: тиыны → «X,XX ₸» (1 ₸ = 100 тиын; деление 100, два знака).
export function formatTenge(tyyn: bigint): string {
  const neg = tyyn < BigInt(0);
  const abs = neg ? -tyyn : tyyn;
  const whole = abs / BigInt(100);
  const frac = abs % BigInt(100);
  const integer = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "−" : ""}${integer},${frac.toString().padStart(2, "0")} ₸`;
}
