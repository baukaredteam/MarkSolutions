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
//
// W0-03a pt2 (ADR-027): транзакционно создаёт LegalEntity юрлицо и membership
// первого администратора — ноль членств невозможен, логин сразу выдаёт active scope.
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
    const legalEntity = await tx.legalEntity.create({
      data: {
        tenantId: tenant.id,
        bin: input.bin,
        name: input.name,
        status: "ACTIVE",
      },
    });
    // ADR-027: счёт принадлежит юрлицу с первого коммита (composite FK валиден)
    await tx.account.create({
      data: {
        tenantId: tenant.id,
        legalEntityId: legalEntity.id,
        balance: BigInt(0),
      },
    });
    const admin = await tx.user.create({
      data: {
        tenantId: tenant.id,
        login: input.adminLogin,
        passwordHash: input.adminPasswordHash,
        roles: JSON.stringify(["admin", "accountant", "operator"]),
      },
    });
    await tx.userLegalEntityMembership.create({
      data: {
        userId: admin.id,
        legalEntityId: legalEntity.id,
        scope: "admin",
      },
    });
    return { tenantId: tenant.id };
  });
}
