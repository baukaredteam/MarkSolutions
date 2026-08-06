import { PrismaClient } from "@prisma/client";

type Handler = (payload: unknown) => Promise<void> | void;

export class OutboxPoller {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly handler: Handler
  ) {}

  async runOnce(): Promise<void> {
    const pending = await this.prisma.outbox.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    for (const record of pending) {
      await this.handler(record.payload);
      await this.prisma.outbox.update({
        where: { id: record.id },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
    }
  }
}
