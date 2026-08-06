import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const url = process.env.DATABASE_URL ?? "file:./dev.db";
    super({ adapter: new PrismaLibSQL({ url }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
