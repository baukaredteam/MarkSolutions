// ORD request shapes (ponytail: interfaces only — no class-validator dep).

export interface CreateOrderDto {
  cardId: string;
  /** STAGE ЛК: 14 digits. 13-digit is rejected (Длина должна быть равна 14). */
  gtin: string;
  places: number;
  unitsPerPlace: number;
  /** ≥ 1; qty=1 is a human STAGE slice, not an API max */
  quantity?: number;
  cisType?: string;
  serialNumberType?: string;
  /** C-04: площадка нанесения (int32). Prefer this over tenant/env. Do not hardcode 803. */
  businessPlaceId?: number;
  /** MPT productGroup. Oils tenant default = autofluids (not catalog motor-oils). */
  productGroup?: string;
}
