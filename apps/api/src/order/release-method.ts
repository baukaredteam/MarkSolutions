// CONTRACT-IS-MPT POST /api/orders: releaseMethodType.
// Spellings are official — COMISSION has one M (not COMMISSION).
// STAGE ЛК shows Первичная/Повторная; Повторная is not a wire value
// (docs/STAGE-LK-FIELDS.md). Do not invent a fifth enum.

export const RELEASE_METHOD_TYPES = [
  "PRIMARY",
  "REMAINS",
  "COMISSION",
  "REMARK",
] as const;

export type ReleaseMethodType = (typeof RELEASE_METHOD_TYPES)[number];

export const DEFAULT_RELEASE_METHOD_TYPE: ReleaseMethodType = "PRIMARY";

export function isReleaseMethodType(value: string): value is ReleaseMethodType {
  return (RELEASE_METHOD_TYPES as readonly string[]).includes(value);
}

/** Omit/blank → PRIMARY. Unknown (incl. Повторная, COMMISSION) → throw. */
export function resolveReleaseMethodType(explicit?: string): ReleaseMethodType {
  if (explicit === undefined) return DEFAULT_RELEASE_METHOD_TYPE;
  const v = explicit.trim();
  if (v === "") return DEFAULT_RELEASE_METHOD_TYPE;
  if (isReleaseMethodType(v)) return v;
  throw new Error("releaseMethodType must be PRIMARY|REMAINS|COMISSION|REMARK");
}
