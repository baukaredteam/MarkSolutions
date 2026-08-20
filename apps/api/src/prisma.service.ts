import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { join } from "node:path";

// W0-02: Dual-mode PrismaService.
// - PostgreSQL (DATABASE_URL starts with postgresql:// or postgres://): direct PrismaClient.
// - SQLite (DATABASE_URL starts with file: or unset): PrismaLibSQL adapter (ADR-015 dev mode).
//
// In production/stage, DATABASE_URL MUST start with postgresql:// (validated by config-validation.ts).
// In development, fallback to local dev.db via PrismaLibSQL.

const SQLITE_DEFAULT_DB = `file:///${join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "db",
  "prisma",
  "dev.db"
).replace(/\\/g, "/")}`;

function isPostgres(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL ?? SQLITE_DEFAULT_DB;
    if (isPostgres(url)) {
      // W0-02: PG uses standard PrismaClient (no adapter needed).
      super();
    } else {
      // W0-015: SQLite dev mode uses PrismaLibSQL adapter.
      super({ adapter: new PrismaLibSQL({ url }) });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
