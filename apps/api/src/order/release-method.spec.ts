import { describe, it, expect } from "vitest";
import {
  DEFAULT_RELEASE_METHOD_TYPE,
  RELEASE_METHOD_TYPES,
  resolveReleaseMethodType,
} from "./release-method";

describe("releaseMethodType (CONTRACT + STAGE-LK-FIELDS)", () => {
  it("CONTRACT enum is PRIMARY|REMAINS|COMISSION|REMARK (COMISSION one M)", () => {
    expect(RELEASE_METHOD_TYPES).toEqual([
      "PRIMARY",
      "REMAINS",
      "COMISSION",
      "REMARK",
    ]);
    expect(DEFAULT_RELEASE_METHOD_TYPE).toBe("PRIMARY");
  });

  it("defaults omitted/blank to PRIMARY", () => {
    expect(resolveReleaseMethodType(undefined)).toBe("PRIMARY");
    expect(resolveReleaseMethodType("")).toBe("PRIMARY");
    expect(resolveReleaseMethodType("  ")).toBe("PRIMARY");
  });

  it("accepts exact CONTRACT strings", () => {
    expect(resolveReleaseMethodType("PRIMARY")).toBe("PRIMARY");
    expect(resolveReleaseMethodType("REMAINS")).toBe("REMAINS");
    expect(resolveReleaseMethodType("COMISSION")).toBe("COMISSION");
    expect(resolveReleaseMethodType("REMARK")).toBe("REMARK");
    expect(resolveReleaseMethodType(" REMAINS ")).toBe("REMAINS");
  });

  it("rejects Повторная, COMMISSION, and other aliases (not on the wire)", () => {
    expect(() => resolveReleaseMethodType("Повторная")).toThrow(
      /PRIMARY\|REMAINS\|COMISSION\|REMARK/
    );
    expect(() => resolveReleaseMethodType("COMMISSION")).toThrow(
      /PRIMARY\|REMAINS\|COMISSION\|REMARK/
    );
    expect(() => resolveReleaseMethodType("commission")).toThrow(
      /PRIMARY\|REMAINS\|COMISSION\|REMARK/
    );
    expect(() => resolveReleaseMethodType("primary")).toThrow(
      /PRIMARY\|REMAINS\|COMISSION\|REMARK/
    );
  });
});
