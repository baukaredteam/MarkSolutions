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

// Файлы соответствия карточки (T3-files, ADR-015): дескриптор в attributes.files.
export const FILE_LABELS = ["front", "back", "declaration"] as const;
export type FileLabel = (typeof FILE_LABELS)[number];

export interface FileDescriptor {
  key: string;
  originalName: string;
  mimeType: string;
  contentHash: string; // sha256
  uploadedAt: string; // ISO
  label: FileLabel;
}

// Валидация файлов (ярус B, ticket 04):
// - фото (front/back) ≥2 с РАЗНЫМИ label; дубль label → ошибка;
// - декларация: согласованность дат + бессрочность.
export function validateFiles(
  files: FileDescriptor[],
  attrs: Record<string, unknown>
): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const photos = files.filter((f) => f.label === "front" || f.label === "back");
  if (photos.length < 2) {
    errors.photos = "нужно минимум 2 фото (front/back)";
  } else {
    const labels = new Set(photos.map((p) => p.label));
    if (labels.size !== photos.length) {
      errors.photos = "фото должны иметь разные label (front/back)";
    }
  }

  const declaration = files.find((f) => f.label === "declaration");
  if (declaration) {
    const perpetual = attrs.declarationPerpetual === true;
    const date = String(attrs.declarationDate ?? "");
    const expiry = String(attrs.declarationExpiry ?? "");
    if (!perpetual && !expiry) {
      errors.declaration =
        "у декларации нужна дата окончания (или бессрочность)";
    } else if (!perpetual && date && expiry && expiry < date) {
      errors.declaration = "дата окончания раньше даты декларации";
    } else if (!perpetual && date && !expiry) {
      errors.declaration = "не указана дата окончания декларации";
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// GS1 check digit (mod 10) — общая для GTIN-14 и SSCC-18 (ADR-025, Q4).
// Веса 3/1 справа налево; контрольная цифра — последняя. Для verify: сумма
// всех цифр с весами (включая check, вес=1) должна делиться на 10.
// (GtinResolver слой 2: валидный mod10 → PENDING_REAL).
export function gs1Mod10CheckDigit(base: string): number {
  const digits = base.split("").map(Number);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const weight = (digits.length - 1 - i) % 2 === 0 ? 3 : 1;
    sum += digits[i] * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function verifyGs1Mod10(code: string, length = 14): boolean {
  if (!/^\d+$/.test(code) || code.length !== length) return false;
  const base = code.slice(0, -1);
  return gs1Mod10CheckDigit(base) === Number(code.slice(-1));
}

// ADR-006: official ИС МПТ code string → structure. GS = 0x1D or literal <GS>.
// Do not log `raw` (full KM).
export type Adr006Km = {
  gtin: string;
  serial: string;
  ai91: string | null;
  ai92: string | null;
  form: "base" | "extended";
};

export function parseAdr006Km(raw: string): Adr006Km {
  const normalized = raw.replaceAll("<GS>", "\x1d");
  const [head, ...rest] = normalized.split("\x1d");
  if (
    !head ||
    !head.startsWith("01") ||
    head.length < 18 ||
    head.slice(16, 18) !== "21"
  ) {
    throw new Error("invalid ADR-006 KM");
  }
  const gtin = head.slice(2, 16);
  const serial = head.slice(18);
  if (!gtin || !serial) throw new Error("invalid ADR-006 KM");
  let ai91: string | null = null;
  let ai92: string | null = null;
  for (const part of rest) {
    if (part.startsWith("91")) ai91 = part.slice(2);
    else if (part.startsWith("92")) ai92 = part.slice(2);
  }
  return {
    gtin,
    serial,
    ai91,
    ai92,
    form: ai91 || ai92 ? "extended" : "base",
  };
}

export function serializeAdr006Km(code: {
  gtin: string;
  serial: string;
  ai91?: string | null;
  ai92?: string | null;
  form?: string;
}): string {
  const g14 = code.gtin.length === 13 ? `0${code.gtin}` : code.gtin;
  let s = `01${g14}21${code.serial}`;
  if (code.form === "extended") {
    if (code.ai91) s += `\x1d91${code.ai91}`;
    if (code.ai92) s += `\x1d92${code.ai92}`;
  }
  return s;
}
