// ORD request shapes (ponytail: interfaces only — no class-validator dep).

export interface CreateOrderDto {
  cardId: string;
  gtin: string;
  places: number;
  unitsPerPlace: number;
  quantity?: number;
  cisType?: string;
  serialNumberType?: string;
  /** C-04: площадка нанесения (int32) */
  businessPlaceId?: number;
  /** MPT productGroup on the wire when set (STAGE oils = autofluids) */
  productGroup?: string;
}
