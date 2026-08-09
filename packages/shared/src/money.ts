// Форматирование тенге (KZT) по казахстанскому стандарту:
// «100 ₸», «80 000,00 ₸» — пробел между числом и символом ₸.
// Деньги хранятся в целых тенге (BigInt), дробных единиц нет (ADR-016).

export function formatKzt(amount: bigint | string | number): string {
  const n = typeof amount === "bigint" ? Number(amount) : Number(amount);
  // целая часть с разделителем тысяч (пробел) + «,00» (единый формат)
  const integer = Math.trunc(n)
    .toLocaleString("ru-RU")
    .replace(/\u00a0/g, " ");
  return `${integer},00 ₸`;
}
