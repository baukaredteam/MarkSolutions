import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createHash } from "node:crypto";

// Демо-хэш (не для prod): sha256 (должен совпадать с AuthService.hashPassword)
function hashPassword(p: string): string {
  return createHash("sha256").update(p).digest("hex");
}

async function main() {
  const url =
    process.env.DATABASE_URL ?? `file:${import.meta.dirname}/../prisma/dev.db`;
  const adapter = new PrismaLibSQL({ url });
  const prisma = new PrismaClient({ adapter });

  const tenant = await prisma.tenant.upsert({
    where: { bin: "111111111111" },
    update: {},
    create: {
      name: "Demo клиент",
      bin: "111111111111",
      status: "ACTIVE",
    },
  });

  const account = await prisma.account.upsert({
    where: { id: "acc-demo" },
    update: {},
    create: {
      id: "acc-demo",
      tenantId: tenant.id,
      balance: BigInt(1000000), // 1 000 000 тиын = 10 000 KZT (минорные)
    },
  });

  // seeded-админ (fallback для демо, если заявка/одобрение не прошли)
  await prisma.user.upsert({
    where: { login: "admin@demo" },
    update: {},
    create: {
      login: "admin@demo",
      tenantId: tenant.id,
      passwordHash: hashPassword("demo-password"),
      roles: JSON.stringify(["admin", "accountant", "operator"]),
    },
  });

  const products = [
    {
      name: "Моторное масло Castrol EDGE 0W-20 C5",
      tnved: "2710198200",
      gtin: "4601005000001",
      demo: true,
    },
    {
      name: "Моторное масло Shell Helix Ultra 5W-40",
      tnved: "3403191000",
      gtin: "4601005000002",
      demo: true,
    },
    {
      name: "Моторное масло MOBIL 1 5W-30",
      tnved: "2710198200",
      gtin: "4601005000003",
    },
    {
      name: "Моторное масло LIQUI MOLY 10W-40",
      tnved: "2710198200",
      gtin: "4601005000004",
    },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: `prod-${p.gtin}` },
      update: {},
      create: { id: `prod-${p.gtin}`, tenantId: tenant.id, ...p },
    });
  }

  console.log(
    `Seeded: tenant=${tenant.bin}, account=${account.balance}, products=${products.length}, admin=admin@demo`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
