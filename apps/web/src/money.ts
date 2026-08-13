// Web-версия formatTenge (тиыны → «4,70 ₸»). Дубликат shared/money.ts — браузер
// не импортирует shared (node:fs в storage.adapter). Один источник — shared (api).

export function formatTenge(tyyn: bigint): string {
  const neg = tyyn < BigInt(0);
  const abs = neg ? -tyyn : tyyn;
  const whole = abs / BigInt(100);
  const frac = abs % BigInt(100);
  const integer = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "−" : ""}${integer},${frac.toString().padStart(2, "0")} ₸`;
}
