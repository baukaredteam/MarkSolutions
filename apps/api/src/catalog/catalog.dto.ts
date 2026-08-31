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

export interface CreateCardDto {
  gtin: string;
  attributes: Record<string, unknown>;
  confirmDuplicate?: boolean;
}

export interface FixTnvedDto {
  tnved: string;
}
