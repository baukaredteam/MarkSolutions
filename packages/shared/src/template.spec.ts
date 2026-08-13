import { describe, it, expect } from "vitest";
import { sheetModel } from "./template";
import {
  motorOilSchemaV1,
  TIER_A_MANUAL,
  TIER_A_AUTO,
  TIER_B,
} from "./catalog-schema";

describe("sheetModel (F2)", () => {
  it("descriptor carries productGroup + schemaVersion", () => {
    const m = sheetModel(motorOilSchemaV1, new Date("2026-08-07T00:00:00Z"));
    expect(m.descriptor.productGroup).toBe("motor-oils");
    expect(m.descriptor.schemaVersion).toBe(1);
    expect(m.descriptor.generatedAt).toBe("2026-08-07T00:00:00.000Z");
  });

  it("headers = attribute names in schema order, tier A starred, B/C not", () => {
    const m = sheetModel(motorOilSchemaV1);
    // 45 атрибутов, порядок схемы (W5-08 +volumeUnit)
    expect(m.headers).toHaveLength(45);
    // ярус A (required) помечен «*» в рендере; на модели required=true
    expect(m.headers.filter((h) => h.required)).toHaveLength(
      TIER_A_MANUAL.length + TIER_A_AUTO.length
    );
    expect(m.headers.filter((h) => !h.required)).toHaveLength(TIER_B.length);
    // порядок: первые 14 — ярус A-ручные; первый — GTIN
    expect(m.headers[0].label).toBe("GTIN");
  });

  it("first header is GTIN (schema order)", () => {
    const m = sheetModel(motorOilSchemaV1);
    expect(m.headers[0].label).toBe("GTIN");
    expect(m.headers[0].required).toBe(true);
  });
});
