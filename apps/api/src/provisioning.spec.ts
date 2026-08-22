import { describe, it, expect, vi } from "vitest";
import { provisionTenant } from "./provisioning";

describe("provisionTenant atomicity (ROLLBACK)", () => {
  it("rolls back tenant+account when user creation fails (no orphans)", async () => {
    const tx = {
      tenant: {
        create: vi.fn().mockResolvedValue({ id: "t-1", bin: "BIN" }),
      },
      account: {
        create: vi.fn().mockResolvedValue({ id: "a-1" }),
      },
      legalEntity: {
        create: vi.fn().mockResolvedValue({ id: "le-1" }),
      },
      user: {
        create: vi.fn().mockRejectedValue(new Error("boom")),
      },
      userLegalEntityMembership: {
        create: vi.fn().mockResolvedValue({ id: "m-1" }),
      },
    };
    const prisma = {
      $transaction: vi.fn().mockImplementation(async (fn) => fn(tx)),
    };

    await expect(
      provisionTenant(prisma as never, {
        bin: "BIN",
        name: "X",
        adminLogin: "admin",
      })
    ).rejects.toThrow("boom");

    // account created in same tx — rejected means whole tx aborted
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.account.create).toHaveBeenCalled();
  });
});
