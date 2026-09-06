/** STAGE ЛК / ИС МПТ: GTIN on order and product create is 14 digits. */

export const GTIN14_LENGTH_ERROR = "Длина должна быть равна 14";

export function isGtin14(gtin: string): boolean {
  return /^\d{14}$/.test(gtin.trim());
}

export function requireGtin14(gtin: string): string {
  const v = gtin.trim();
  if (!isGtin14(v)) throw new Error(GTIN14_LENGTH_ERROR);
  return v;
}

/** KZ oils tenant: STAGE productGroup is autofluids (not catalog motor-oils). */
export const STAGE_OILS_PRODUCT_GROUP = "autofluids";

export function resolveOrderProductGroup(explicit?: string): string {
  const v = explicit?.trim();
  return v || STAGE_OILS_PRODUCT_GROUP;
}
