import { PrismaClient } from "@prisma/client";

export interface ProvisionInput {
  bin: string;
  name: string;
  adminLogin: string;
  adminPasswordHash: string;
}

export interface ProvisionResult {
  tenantId: string;
}

// Атомарный provisioning (ADR-016): tenant + счёт + базовые роли в одной транзакции.
// Любой сбой → полный ROLLBACK, никаких осиротевших tenant/счёт.
export async function provisionTenant(
  prisma: PrismaClient,
  input: ProvisionInput
): Promise<ProvisionResult> {
  return prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        bin: input.bin,
        name: input.name,
        status: "ACTIVE",
      },
    });
    await tx.account.create({
      data: {
        tenantId: tenant.id,
        balance: BigInt(0),
      },
    });
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        login: input.adminLogin,
        passwordHash: input.adminPasswordHash,
        roles: JSON.stringify(["admin", "accountant", "operator"]),
      },
    });
    return { tenantId: tenant.id };
  });
}
