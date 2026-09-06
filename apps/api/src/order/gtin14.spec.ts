import { describe, it, expect } from "vitest";
import {
  GTIN14_LENGTH_ERROR,
  isGtin14,
  requireGtin14,
  resolveOrderProductGroup,
  STAGE_OILS_PRODUCT_GROUP,
} from "./gtin14";

describe("GTIN-14 (P2-C, STAGE ЛК)", () => {
  it("rejects 13-digit GTIN with Длина должна быть равна 14", () => {
    expect(isGtin14("4650063110374")).toBe(false);
    expect(() => requireGtin14("4650063110374")).toThrow(GTIN14_LENGTH_ERROR);
  });

  it("accepts 04650063110374-shaped 14-digit input", () => {
    expect(isGtin14("04650063110374")).toBe(true);
    expect(requireGtin14("04650063110374")).toBe("04650063110374");
    expect(requireGtin14(" 04650063110374 ")).toBe("04650063110374");
  });

  it("rejects empty / non-digit / wrong length", () => {
    expect(isGtin14("")).toBe(false);
    expect(isGtin14("0401483572339")).toBe(false);
    expect(isGtin14("040148357233990")).toBe(false);
    expect(isGtin14("0401483572339a")).toBe(false);
  });

  it("defaults productGroup to autofluids for oils tenant", () => {
    expect(STAGE_OILS_PRODUCT_GROUP).toBe("autofluids");
    expect(resolveOrderProductGroup(undefined)).toBe("autofluids");
    expect(resolveOrderProductGroup("")).toBe("autofluids");
    expect(resolveOrderProductGroup("from-order")).toBe("from-order");
  });
});
