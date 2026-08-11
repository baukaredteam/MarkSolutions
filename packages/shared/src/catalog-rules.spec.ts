import { describe, it, expect } from "vitest";
import {
  IN_LIST,
  isInList,
  tnvedHint,
  heuristicStrengthensFix,
  checkDuplicate,
  verifyGs1Mod10,
  gs1Mod10CheckDigit,
  type FuzzyKey,
} from "./catalog-rules";

describe("TNVED filter (ADR-022)", () => {
  it("isInList matches the 4 allowed codes", () => {
    expect(IN_LIST).toHaveLength(4);
    expect(isInList("2710198200")).toBe(true);
    expect(isInList("3403191000")).toBe(true);
    expect(isInList("3403199000")).toBe(true);
    expect(isInList("3403990000")).toBe(true);
    expect(isInList("27101919")).toBe(false);
  });

  it("tnvedHint returns 'возможно 2710198200' for out-of-list codes", () => {
    expect(tnvedHint("27101919")).toBe("возможно 2710198200");
    expect(tnvedHint("2710198200")).toBeNull();
  });

  it("п.15 heuristic: motor-oil markers strengthen fix hint", () => {
    // Nomad 27101919 with markers → strengthen toward "исправить код"
    expect(heuristicStrengthensFix("Nomad Novo 7000 SAE 15W40")).toBe(true);
    expect(heuristicStrengthensFix("Моторное масло ATF III")).toBe(true);
    expect(heuristicStrengthensFix("Моторное масло GL-4")).toBe(true);
    // нет маркеров → не усиливать
    expect(heuristicStrengthensFix("Канистра 4л")).toBe(false);
  });
});

describe("GS1 check digit (mod 10) — GtinResolver слой 2 + SSCC (ADR-025)", () => {
  it("RAVENOL 04014835723399 → valid GTIN-14", () => {
    expect(verifyGs1Mod10("04014835723399")).toBe(true);
  });

  it("codes_success 04870267100135 → valid", () => {
    expect(verifyGs1Mod10("04870267100135")).toBe(true);
  });

  it("corrupted check digit → invalid", () => {
    expect(verifyGs1Mod10("04014835723398")).toBe(false);
  });

  it("not 14 digits → invalid", () => {
    expect(verifyGs1Mod10("0401483572339")).toBe(false);
    expect(verifyGs1Mod10("")).toBe(false);
    expect(verifyGs1Mod10("0401483572339a")).toBe(false);
  });

  it("SSCC-18: валиден, check digit вычисляется", () => {
    const sscc = "012345670000000015"; // check=5
    expect(verifyGs1Mod10(sscc, 18)).toBe(true);
    const base = sscc.slice(0, -1);
    expect(gs1Mod10CheckDigit(base)).toBe(5);
    expect(verifyGs1Mod10("012345670000000010", 18)).toBe(false);
  });

  it("gs1Mod10CheckDigit для GTIN-14 base совпадает с последней цифрой", () => {
    expect(gs1Mod10CheckDigit("0401483572339")).toBe(9);
  });
});

describe("fuzzy duplicates (бренд+модель+объём+SAE)", () => {
  const key: FuzzyKey = {
    brand: "Castrol",
    model: "EDGE",
    volumeL: 4,
    sae: "0W-20",
  };

  it("exact fuzzy key match → warning", () => {
    expect(checkDuplicate(key, [{ ...key }])).toBe(true);
  });

  it("case/space-insensitive match", () => {
    expect(
      checkDuplicate(key, [
        { brand: "  castrol ", model: "edge", volumeL: 4, sae: "0W-20" },
      ])
    ).toBe(true);
  });

  it("different SAE → not a duplicate (0W-20 != 5W-30)", () => {
    expect(
      checkDuplicate(key, [
        { brand: "Castrol", model: "EDGE", volumeL: 4, sae: "5W-30" },
      ])
    ).toBe(false);
  });

  it("different volume → not a duplicate", () => {
    expect(
      checkDuplicate(key, [
        { brand: "Castrol", model: "EDGE", volumeL: 1, sae: "0W-20" },
      ])
    ).toBe(false);
  });
});
