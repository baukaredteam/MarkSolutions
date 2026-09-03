import { describe, it, expect } from "vitest";
import { assertCreateCardGtin, CREATE_CARD_GTIN14_ERROR } from "./catalog.dto";

describe("CreateCardDto GTIN-14 (P2-C)", () => {
  it("rejects 13-digit GTIN", () => {
    expect(() => assertCreateCardGtin("4650063110374")).toThrow(
      CREATE_CARD_GTIN14_ERROR
    );
  });

  it("accepts 04650063110374-shaped input", () => {
    expect(assertCreateCardGtin("04650063110374")).toBe("04650063110374");
  });
});
