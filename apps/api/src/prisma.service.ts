import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { join } from "node:path";

// Дефолт: общий dev.db рядом со схемой (packages/db/prisma/dev.db), независимо от cwd.
// Позволяет `npm run dev` работать без DATABASE_URL (тот же файл, что seed/migrate).
const DEFAULT_DB = `file:///${join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "db",
  "prisma",
  "dev.db"
).replace(/\\/g, "/")}`;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL ?? DEFAULT_DB;
    super({ adapter: new PrismaLibSQL({ url }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
