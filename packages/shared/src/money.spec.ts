import { describe, it, expect } from "vitest";
import { formatKzt } from "./money";

describe("formatKzt (казахстанский стандарт)", () => {
  it("100 → «100,00 ₸»", () => {
    expect(formatKzt(100)).toBe("100,00 ₸");
  });

  it("80 000 → «80 000,00 ₸» (пробел-разделитель тысяч)", () => {
    expect(formatKzt(80000)).toBe("80 000,00 ₸");
  });

  it("BigInt и string работают одинаково", () => {
    expect(formatKzt(BigInt(100))).toBe("100,00 ₸");
    expect(formatKzt("80000")).toBe("80 000,00 ₸");
  });
});
