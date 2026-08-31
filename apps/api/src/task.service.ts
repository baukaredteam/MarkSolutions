import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

export const TASK_SOURCE_OUTBOX = "OUTBOX_FAILED";
export const TASK_SOURCE_ALERT = "UTILISATION_ALERT";

type OutboxPayload = {
  tenantId?: string;
  reason?: string;
  orderId?: string;
};

export type TaskDto = {
  id: string;
  tenantId: string;
  source: string;
  sourceRef: string;
  type: string;
  title: string;
  status: string;
  severity: string;
  createdAt: Date;
};

@Injectable()
export class TaskService {
  constructor(private readonly prisma: PrismaService) {}

  // Project existing exception sources into Task. Idempotent via unique(tenantId, source, sourceRef).
  async materialize(tenantId: string): Promise<void> {
    if (!tenantId) throw new Error("tenant required");

    const failed = await this.prisma.outbox.findMany({
      where: { status: "FAILED" },
      select: { id: true, aggregate: true, payload: true },
    });
    const mine = failed.filter((row) => {
      const payload = row.payload as OutboxPayload;
      return payload?.tenantId === tenantId;
    });

    const alerts = await this.prisma.utilisationAlert.findMany({
      where: { tenantId, firedAt: null },
      select: { id: true, daysLeft: true, kind: true, orderId: true },
    });

    for (const row of mine) {
      const payload = row.payload as OutboxPayload;
      const reason =
        typeof payload.reason === "string" && payload.reason.trim()
          ? payload.reason.trim()
          : row.aggregate;
      await this.prisma.task.upsert({
        where: {
          tenantId_source_sourceRef: {
            tenantId,
            source: TASK_SOURCE_OUTBOX,
            sourceRef: row.id,
          },
        },
        create: {
          tenantId,
          source: TASK_SOURCE_OUTBOX,
          sourceRef: row.id,
          type: "ERROR",
          title: `Ошибка интеграции: ${reason}`,
          status: "OPEN",
          severity: "CRITICAL",
        },
        update: {},
      });
    }

    for (const alert of alerts) {
      await this.prisma.task.upsert({
        where: {
          tenantId_source_sourceRef: {
            tenantId,
            source: TASK_SOURCE_ALERT,
            sourceRef: alert.id,
          },
        },
        create: {
          tenantId,
          source: TASK_SOURCE_ALERT,
          sourceRef: alert.id,
          type: "WARNING",
          title: `Алерт нанесения: осталось ${alert.daysLeft} дн.`,
          status: "OPEN",
          severity: alert.daysLeft <= 1 ? "CRITICAL" : "HIGH",
        },
        update: {},
      });
    }
  }

  async list(tenantId: string): Promise<{ items: TaskDto[] }> {
    if (!tenantId) throw new Error("tenant required");
    await this.materialize(tenantId);
    const items = await this.prisma.task.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });
    return { items };
  }

  async createFromSources(tenantId: string): Promise<{ items: TaskDto[] }> {
    return this.list(tenantId);
  }

  async countOpen(tenantId: string): Promise<number> {
    if (!tenantId) throw new Error("tenant required");
    await this.materialize(tenantId);
    return this.prisma.task.count({
      where: { tenantId, status: "OPEN" },
    });
  }
}
