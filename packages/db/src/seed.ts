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

  // seeded-пользователи (T0-RBAC, ADR-020 апдейт): admin полный набор;
  // manager/accountant/marking/warehouse/viewer — по одной роли (демо не ломается).
  await prisma.user.upsert({
    where: { login: "admin@demo" },
    update: {},
    create: {
      login: "admin@demo",
      tenantId: tenant.id,
      passwordHash: hashPassword("demo-password"),
      roles: JSON.stringify([
        "admin",
        "manager",
        "accountant",
        "marking",
        "warehouse",
        "viewer",
        "operator",
      ]),
    },
  });
  const demoRoles: [string, string[]][] = [
    ["manager@demo", ["manager"]],
    ["accountant@demo", ["accountant"]],
    ["marking@demo", ["marking"]],
    ["warehouse@demo", ["warehouse"]],
    ["viewer@demo", ["viewer"]],
  ];
  for (const [login, roles] of demoRoles) {
    await prisma.user.upsert({
      where: { login },
      update: {},
      create: {
        login,
        tenantId: tenant.id,
        passwordHash: hashPassword("demo-password"),
        roles: JSON.stringify(roles),
      },
    });
  }

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

  // W5-07: тарифы по товарным группам (тиыны за КМ, цена включает НДС).
  // Категории маркировки РК (данные, не хардкод).
  // C-07 (аудит 13.08): цена MarkFlow за КМ = 8 ₸ = 800 тиын (не 47 000 = 470 ₸).
  // Себестоимость оператора 4,7 ₸ = 470 тиын — не клиентский тариф (отдельно).
  const TARIFFS: { productGroup: string; pricePerCodeKZT: bigint }[] = [
    { productGroup: "motor-oils", pricePerCodeKZT: BigInt(800) }, // 8 ₸
    { productGroup: "medicines", pricePerCodeKZT: BigInt(24000) }, // 240 ₸
    { productGroup: "footwear", pricePerCodeKZT: BigInt(26800) }, // 268 ₸
    { productGroup: "tobacco", pricePerCodeKZT: BigInt(26800) },
    { productGroup: "dietary-supplements", pricePerCodeKZT: BigInt(26800) },
    { productGroup: "light-industry", pricePerCodeKZT: BigInt(31400) }, // 314 ₸
  ];
  const now = Date.now();
  // общий тариф (productGroup=null) — fallback, когда группа товара не определена
  await prisma.tariff.upsert({
    where: { id: "tariff-default" },
    update: {},
    create: {
      id: "tariff-default",
      productGroup: null,
      pricePerCodeKZT: BigInt(800), // 8 ₸ (C-07)
      validFrom: new Date(now - 86400000),
      validTo: new Date(now + 2 * 86400000),
      vatIncluded: true,
    },
  });
  for (const t of TARIFFS) {
    await prisma.tariff.upsert({
      where: { id: `tariff-${t.productGroup}` },
      update: {},
      create: {
        id: `tariff-${t.productGroup}`,
        productGroup: t.productGroup,
        pricePerCodeKZT: t.pricePerCodeKZT,
        validFrom: new Date(now - 86400000),
        validTo: new Date(now + 2 * 86400000),
        vatIncluded: true,
      },
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
