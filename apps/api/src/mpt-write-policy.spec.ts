import { describe, it, expect } from "vitest";
import { createMptWritePolicy, WriteDisabledError } from "./mpt-write-policy";

describe("MptWritePolicy", () => {
  it("defaults to disabled and rejects every business write", () => {
    const policy = createMptWritePolicy({ mptWriteEnabled: false });
    for (const op of [
      "createOrder",
      "submitUtilisation",
      "submitImport",
      "submitWithdrawal",
    ] as const) {
      expect(() => policy.assertAllowed(op)).toThrow(WriteDisabledError);
    }
  });

  it("allows writes only when explicitly enabled", () => {
    const policy = createMptWritePolicy({ mptWriteEnabled: true });
    expect(() => policy.assertAllowed("createOrder")).not.toThrow();
  });

  it("treats any non-true value as disabled", () => {
    for (const v of [undefined, null, "false", "true", 0, 1]) {
      const policy = createMptWritePolicy({ mptWriteEnabled: v as never });
      expect(() => policy.assertAllowed("createOrder")).toThrow(
        WriteDisabledError
      );
    }
  });
});
