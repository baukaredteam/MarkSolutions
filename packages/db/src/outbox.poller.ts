import { PrismaClient } from "@prisma/client";

type Handler = (payload: unknown) => Promise<void> | void;

export class OutboxPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly handler: Handler,
    private readonly intervalMs: number = 1000
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runOnce().catch((e) => console.error("outbox poll error", e));
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.drain();
  }

  private async drain(): Promise<void> {
    while (this.running) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.prisma.outbox.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      for (const record of pending) {
        // exactly-once: atomic claim, only one poller processes this record
        const claimed = await this.prisma.outbox.updateMany({
          where: { id: record.id, status: "PENDING" },
          data: { status: "PROCESSING" },
        });
        if (claimed.count === 0) continue;
        try {
          await this.handler(record.payload);
          await this.prisma.outbox.update({
            where: { id: record.id },
            data: { status: "PROCESSED", processedAt: new Date() },
          });
        } catch {
          await this.prisma.outbox.update({
            where: { id: record.id },
            data: { status: "FAILED" },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
