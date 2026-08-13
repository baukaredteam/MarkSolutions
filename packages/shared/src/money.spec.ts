import { describe, it, expect } from "vitest";
import { formatKzt, formatTenge } from "./money";

describe("formatKzt (казахстанский стандарт, целые тенге)", () => {
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

describe("formatTenge (тиыны → ₸, W5-07 ADR-016)", () => {
  it("470 тиын → «4,70 ₸»", () => {
    expect(formatTenge(BigInt(470))).toBe("4,70 ₸");
  });

  it("10000000 тиын → «100 000,00 ₸»", () => {
    expect(formatTenge(BigInt(10000000))).toBe("100 000,00 ₸");
  });

  it("0 → «0,00 ₸»; 5 тиын → «0,05 ₸»", () => {
    expect(formatTenge(BigInt(0))).toBe("0,00 ₸");
    expect(formatTenge(BigInt(5))).toBe("0,05 ₸");
  });
});
