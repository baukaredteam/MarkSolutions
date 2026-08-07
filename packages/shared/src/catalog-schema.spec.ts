import { describe, it, expect } from "vitest";
import {
  motorOilSchemaV1,
  TIER_A_MANUAL,
  TIER_A_AUTO,
  TIER_B,
  validateAttributes,
  autofillAttributes,
  type MotorOilAttributes,
} from "./catalog-schema";

const validManual: Partial<MotorOilAttributes> = {
  gtin: "04014835723399",
  name: "Моторное масло Castrol EDGE 0W-20 C5",
  brand: "Castrol",
  countryOfBrand: "Германия",
  composition: "синтетическое",
  shelfLifeMonths: 60,
  productType: "моторное масло",
  volumeL: 4,
  purpose: "легковые автомобили",
  sae: "0W-20",
  storage: "сухое место",
  conformityMark: "нет",
  eacMarks: "нет",
  grossWeightKg: 3.8,
};

const fullTenant: Record<string, string> = {
  tnved: "2710198200",
  group: "Смазочные материалы и специальные жидкости",
  category: "Моторные, компрессорные, турбинные масла",
  packageType: "Единица товара",
  kpved: "19.20.29",
  gpc: "10005267",
  ownerGcp: "0401483",
  ownerName: "ТОО Автодеталь",
  ownerCountry: "Казахстан",
  ownerAddress: "г. Шымкент, ул. Байтулы Баба 14А",
  platformName: "1ecom",
  platformCountry: "Казахстан",
  platformAddress: "г. Алматы",
  participantTaxNumber: "123456789012",
  participantName: "ТОО Автодеталь",
  participantCountry: "Казахстан",
  participantAddress: "г. Шымкент",
};

describe("motor-oils schema v1", () => {
  it("has schemaVersion 1 and 44 attributes across tiers", () => {
    expect(motorOilSchemaV1.schemaVersion).toBe(1);
    const total = TIER_A_MANUAL.length + TIER_A_AUTO.length + TIER_B.length;
    expect(total).toBe(44);
  });

  it("tier A empty → error (blocks submission)", () => {
    const err = validateAttributes({ ...validManual, gtin: undefined });
    expect(err.ok).toBe(false);
    if (!err.ok) {
      expect(err.errors.gtin).toBeTruthy();
    }
  });

  it("tier B empty → ok (photo/declaration optional)", () => {
    const auto = autofillAttributes(validManual, fullTenant);
    const err = validateAttributes(auto);
    expect(err.ok).toBe(true);
  });

  it("tier C empty → autofill from tenant", () => {
    const filled = autofillAttributes({} as MotorOilAttributes, fullTenant);
    expect(filled.ownerName).toBe("ТОО Автодеталь");
    expect(filled.ownerGcp).toBe("0401483");
  });

  it("no enums — statuses and tiers are strings (ADR-016)", () => {
    // schema does not use TS enum; tier membership is data
    expect(typeof TIER_A_MANUAL).toBe("object");
    expect(TIER_B.includes("photo")).toBe(true);
  });
});
