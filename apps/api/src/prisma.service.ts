import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// W0-02R: PostgreSQL is the single canonical database for dev/test/stage/prod.
// The generated Prisma client targets provider=postgresql; no driver adapter is used.
// Stage/production DATABASE_URL MUST start with postgresql:// (validated by config-validation.ts).
// Local/test bootstrap uses a disposable PostgreSQL database via TEST_DATABASE_URL.

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // DATABASE_URL must be a PostgreSQL connection string (postgresql:// or postgres://).
    super();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
