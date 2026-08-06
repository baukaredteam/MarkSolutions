import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    const url = process.env.DATABASE_URL ?? "file:./dev.db";
    this.client = new PrismaClient({ adapter: new PrismaLibSQL({ url }) });
  }

  get $queryRaw() {
    return this.client.$queryRaw.bind(this.client);
  }

  get $executeRawUnsafe() {
    return this.client.$executeRawUnsafe.bind(this.client);
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
