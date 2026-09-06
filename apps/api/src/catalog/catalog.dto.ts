// CAT request shapes (ponytail: interfaces only — no class-validator dep).

export interface DraftRowDto {
  name?: string;
  tnved?: string;
  brand?: string;
  sae?: string;
  volumeL?: number;
  gtin?: string;
  demo?: boolean;
  source?: string;
}

export interface ImportDraftsDto {
  rows: DraftRowDto[];
}

/** STAGE ЛК: GTIN-14. Catalog tariff group stays motor-oils; MPT ТГ is autofluids. */
export const CREATE_CARD_GTIN14_ERROR = "Длина должна быть равна 14";

export function assertCreateCardGtin(gtin: string): string {
  const v = gtin.trim();
  if (!/^\d{14}$/.test(v)) throw new Error(CREATE_CARD_GTIN14_ERROR);
  return v;
}

export interface CreateCardDto {
  /** STAGE / GS1: 14 digits. 13-digit → reject (Длина должна быть равна 14). */
  gtin: string;
  attributes: Record<string, unknown>;
  confirmDuplicate?: boolean;
}

export interface FixTnvedDto {
  tnved: string;
}
