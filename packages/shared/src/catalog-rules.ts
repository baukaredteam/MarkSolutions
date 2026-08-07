// Каталог: правила фильтра ТНВЭД (ADR-022), эвристика наименования (п.15),
// нечёткие дубли (бренд+модель+объём+SAE). Чистые функции, без IO.

export const IN_LIST = ["2710198200", "3403191000", "3403199000", "3403990000"];

export function isInList(tnved: string): boolean {
  return IN_LIST.includes(tnved);
}

export function tnvedHint(tnved: string): string | null {
  return isInList(tnved) ? null : "возможно 2710198200";
}

// Маркеры моторного масла (п.15 Правил: руководствоваться кодом И наименованием).
const OIL_MARKERS = ["масло", "моторное", "sae", "atf", "api ", "acea", "gl-"];

export function heuristicStrengthensFix(name: string): boolean {
  const n = name.toLowerCase();
  return OIL_MARKERS.some((m) => n.includes(m));
}

export interface FuzzyKey {
  brand: string;
  model: string;
  volumeL: number;
  sae: string;
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

export function fuzzyKeyOf(a: {
  brand: string;
  model: string;
  volumeL: number;
  sae: string;
}): FuzzyKey {
  return {
    brand: norm(a.brand),
    model: norm(a.model),
    volumeL: a.volumeL,
    sae: norm(a.sae),
  };
}

export function fuzzyEqual(a: FuzzyKey, b: FuzzyKey): boolean {
  return (
    a.brand === b.brand &&
    a.model === b.model &&
    a.volumeL === b.volumeL &&
    a.sae === b.sae
  );
}

export function checkDuplicate(
  candidate: FuzzyKey,
  existing: FuzzyKey[]
): boolean {
  return existing.some((e) => fuzzyEqual(fuzzyKeyOf(candidate), fuzzyKeyOf(e)));
}
