// JSON-схема каталога «Моторные масла» v1 (ADR-021): единственный источник истины.
// Справочники как данные, ярусы A-ручные / A-авто / B-опциональные (ADR-021).
// Без enum (ADR-016) — ярусы и статусы это данные.

export interface CatalogSchema {
  productGroup: string;
  schemaVersion: number;
  attributes: AttributeDef[];
}

export interface AttributeDef {
  key: string;
  label: string;
  tier: "A_MANUAL" | "A_AUTO" | "B";
  type: "string" | "number" | "boolean" | "ref";
  ref?: string; // имя справочника
  required: boolean; // ярус A → true
  autofill?: boolean; // ярус A_AUTO → автозаполнение из tenant
  defaultValue?: string; // дефолт при отсутствии (W5-08: volumeUnit="л")
}

export const REFERENCES = {
  tnved: ["2710198200", "3403191000", "3403199000", "3403990000"],
  kpved: ["19.20.29", "20.59.41"],
  gpc: ["10005267"],
  sae: [
    "0W-20",
    "0W-30",
    "0W-40",
    "5W-20",
    "5W-30",
    "5W-40",
    "10W-30",
    "10W-40",
    "15W-40",
    "20W-50",
  ],
  conformity: ["нет", "СТ РК"],
  eac: ["нет", "EAC"],
  productGroup: ["Смазочные материалы и специальные жидкости"],
  productCategory: ["Моторные, компрессорные, турбинные масла"],
  packageType: ["Единица товара"],
} as const;

const A_MANUAL: AttributeDef[] = [
  {
    key: "gtin",
    label: "GTIN",
    tier: "A_MANUAL",
    type: "string",
    required: true,
  },
  {
    key: "name",
    label: "Торговое наименование",
    tier: "A_MANUAL",
    type: "string",
    required: true,
  },
  {
    key: "brand",
    label: "Товарный знак",
    tier: "A_MANUAL",
    type: "string",
    required: true,
  },
  {
    key: "countryOfBrand",
    label: "Страна товарного знака",
    tier: "A_MANUAL",
    type: "string",
    required: true,
  },
  {
    key: "composition",
    label: "Состав",
    tier: "A_MANUAL",
    type: "string",
    required: true,
  },
  {
    key: "shelfLifeMonths",
    label: "Срок годности (мес)",
    tier: "A_MANUAL",
    type: "number",
    required: true,
  },
  {
    key: "productType",
    label: "Вид товара",
    tier: "A_MANUAL",
    type: "string",
    required: true,
  },
  {
    key: "volumeL",
    label: "Объём (л)",
    tier: "A_MANUAL",
    type: "number",
    required: true,
  },
  {
    key: "purpose",
    label: "Назначение",
    tier: "A_MANUAL",
    type: "string",
    required: true,
  },
  {
    key: "sae",
    label: "SAE",
    tier: "A_MANUAL",
    type: "ref",
    ref: "sae",
    required: true,
  },
  {
    key: "storage",
    label: "Хранение",
    tier: "A_MANUAL",
    type: "string",
    required: true,
  },
  {
    key: "conformityMark",
    label: "Знак соответствия СТ РК",
    tier: "A_MANUAL",
    type: "ref",
    ref: "conformity",
    required: true,
  },
  {
    key: "eacMarks",
    label: "Знаки обращения EAC",
    tier: "A_MANUAL",
    type: "ref",
    ref: "eac",
    required: true,
  },
  {
    key: "grossWeightKg",
    label: "Вес брутто (кг)",
    tier: "A_MANUAL",
    type: "number",
    required: true,
  },
];

const A_AUTO: AttributeDef[] = [
  {
    key: "group",
    label: "Группа",
    tier: "A_AUTO",
    type: "ref",
    ref: "productGroup",
    required: true,
    autofill: true,
  },
  {
    key: "category",
    label: "Категория",
    tier: "A_AUTO",
    type: "ref",
    ref: "productCategory",
    required: true,
    autofill: true,
  },
  {
    key: "packageType",
    label: "Тип упаковки",
    tier: "A_AUTO",
    type: "ref",
    ref: "packageType",
    required: true,
    autofill: true,
  },
  {
    key: "kpved",
    label: "КПВЭД",
    tier: "A_AUTO",
    type: "ref",
    ref: "kpved",
    required: true,
    autofill: true,
  },
  {
    key: "gpc",
    label: "GPC",
    tier: "A_AUTO",
    type: "ref",
    ref: "gpc",
    required: true,
    autofill: true,
  },
  {
    key: "tnved",
    label: "ТНВЭД",
    tier: "A_AUTO",
    type: "ref",
    ref: "tnved",
    required: true,
    autofill: true,
  },
  {
    key: "ownerGcp",
    label: "GCP владельца GTIN",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "ownerName",
    label: "Наименование владельца GTIN",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "ownerCountry",
    label: "Страна владельца GTIN",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "ownerAddress",
    label: "Адрес владельца GTIN",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "platformName",
    label: "Производитель (наименование)",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "platformCountry",
    label: "Производитель (страна)",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "platformAddress",
    label: "Производитель (адрес)",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "participantTaxNumber",
    label: "Налоговый номер участника",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "participantName",
    label: "Наименование участника",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "participantCountry",
    label: "Страна участника",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
  {
    key: "participantAddress",
    label: "Адрес участника",
    tier: "A_AUTO",
    type: "string",
    required: true,
    autofill: true,
  },
];

const B: AttributeDef[] = [
  {
    key: "declarationType",
    label: "Тип декларации",
    tier: "B",
    type: "string",
    required: false,
  },
  {
    key: "declarationNumber",
    label: "№ декларации",
    tier: "B",
    type: "string",
    required: false,
  },
  {
    key: "declarationDate",
    label: "Дата декларации",
    tier: "B",
    type: "string",
    required: false,
  },
  {
    key: "declarationExpiry",
    label: "Действует до",
    tier: "B",
    type: "string",
    required: false,
  },
  {
    key: "declarationPerpetual",
    label: "Бессрочная декларация",
    tier: "B",
    type: "boolean",
    required: false,
  },
  {
    key: "packageKind",
    label: "Вид упаковки",
    tier: "B",
    type: "string",
    required: false,
  },
  {
    key: "packageMaterial",
    label: "Материал упаковки",
    tier: "B",
    type: "string",
    required: false,
  },
  {
    key: "weightUnit",
    label: "Единица веса",
    tier: "B",
    type: "string",
    required: false,
  },
  {
    key: "volumeUnit",
    label: "Единица объёма",
    tier: "B",
    type: "string",
    required: false,
    defaultValue: "л",
  },
  {
    key: "widthCm",
    label: "Ширина (см)",
    tier: "B",
    type: "number",
    required: false,
  },
  {
    key: "heightCm",
    label: "Высота (см)",
    tier: "B",
    type: "number",
    required: false,
  },
  {
    key: "depthCm",
    label: "Глубина (см)",
    tier: "B",
    type: "number",
    required: false,
  },
  { key: "photo", label: "Фото", tier: "B", type: "string", required: false }, // дескриптор файлов
  {
    key: "participantGcp",
    label: "GCP участника",
    tier: "B",
    type: "string",
    required: false,
  },
];

export const motorOilSchemaV1: CatalogSchema = {
  productGroup: "motor-oils",
  schemaVersion: 1,
  attributes: [...A_MANUAL, ...A_AUTO, ...B],
};

export const TIER_A_MANUAL = A_MANUAL.map((a) => a.key);
export const TIER_A_AUTO = A_AUTO.map((a) => a.key);
export const TIER_B = B.map((a) => a.key);

export type MotorOilAttributes = Record<
  string,
  string | number | boolean | undefined
>;

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

// Ярус A (ручные + авто, если не автозаполнены) обязателен для Submitted; ярус B опционален.
export function validateAttributes(
  attrs: Partial<MotorOilAttributes>
): ValidationResult {
  const errors: Record<string, string> = {};
  for (const def of [...A_MANUAL, ...A_AUTO]) {
    const v = attrs[def.key];
    const empty = v === undefined || v === null || v === "";
    if (def.required && empty && !def.autofill) {
      errors[def.key] = `required: ${def.label}`;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

// Ярус A_AUTO: автозаполнение из tenant, если пусто.
export function autofillAttributes(
  attrs: Partial<MotorOilAttributes>,
  tenant: Record<string, string>
): MotorOilAttributes {
  const out: MotorOilAttributes = { ...attrs };
  for (const def of A_AUTO) {
    if (def.autofill && (out[def.key] === undefined || out[def.key] === "")) {
      out[def.key] = tenant[def.key] ?? "";
    }
  }
  for (const def of motorOilSchemaV1.attributes) {
    if (
      def.defaultValue &&
      (out[def.key] === undefined || out[def.key] === "")
    ) {
      out[def.key] = def.defaultValue;
    }
  }
  return out;
}
