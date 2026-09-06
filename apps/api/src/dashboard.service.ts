import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { TaskService } from "./task.service";

export type OpsDay = { date: string; count: number };

/** ponytail: UTC calendar day; tenant TZ later if ops complain. */
export function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

export function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildOpsLast7d(
  timestamps: Iterable<Date>,
  now = new Date()
): OpsDay[] {
  const today = startOfUtcDay(now);
  const days: OpsDay[] = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today.getTime() - (6 - i) * 86400000);
    return { date: utcDateKey(day), count: 0 };
  });
  const idx = new Map(days.map((d, i) => [d.date, i]));
  for (const ts of timestamps) {
    const i = idx.get(utcDateKey(ts));
    if (i !== undefined) days[i].count += 1;
  }
  return days;
}

export function opsDeltaPct(today: number, yesterday: number): number | null {
  if (yesterday === 0) return null;
  return Math.round(((today - yesterday) / yesterday) * 100);
}

// Дашборд «Следующие действия» (W4-06, Q10, ADR-025): ОДИН снимок 5 счётчиков.
// openAggregates и serviceActExport = 0 в MVP (тикеты 03/05 stretch после демо).
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TaskService
  ) {}

  private get deadlineDays(): number {
    return Number(process.env.UTIL_DEADLINE_DAYS ?? 30);
  }

  // Q10: 5 счётчиков одним снимком (Promise.all — атомарная согласованность по смыслу)
  async summary(tenantId: string) {
    if (!tenantId) throw new ForbiddenException("tenant required");
    const now = new Date();
    const cutoff = new Date(Date.now() - (this.deadlineDays - 7) * 86400000);
    const opsFrom = startOfUtcDay(now);
    opsFrom.setUTCDate(opsFrom.getUTCDate() - 6);
    const [
      codesNotApplied,
      deadlineSoon,
      openAggregates,
      docsPendingDt,
      failedTasks,
      alertsOpen,
      hasCards,
      hasRegistered,
      hasOrders,
      hasPrinted,
      hasApplied,
      hasIntroduced,
      importOps,
      withdrawalOps,
      utilisationOps,
      eventOps,
      orderOps,
    ] = await Promise.all([
      this.prisma.codeVault.count({
        where: {
          tenantId,
          status: { in: ["ACTIVE", "PRINTED"] },
        },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] },
          updatedAt: { lte: cutoff }, // дедлайн ≤7 суток от updatedAt (получения КМ)
        },
      }),
      this.prisma.aggregationUnit.count({
        where: { tenantId, status: { in: ["OPEN", "SEALED"] } },
      }),
      this.prisma.importDocument.count({
        where: { tenantId, status: "EXPECTED" },
      }),
      // outbox не tenant-scoped (служебная таблица) — фильтруем по payload.tenantId в JS
      this.prisma.outbox.findMany({
        where: {
          aggregate: "mpt-order-timeout",
          status: "FAILED",
        },
        select: { payload: true },
      }),
      this.prisma.utilisationAlert.count({
        where: { tenantId, firedAt: null },
      }),
      // степпер-флаги (UI-03): прогрессия жизненного цикла
      this.prisma.productCard.count({ where: { tenantId } }),
      this.prisma.productCard.count({
        where: { tenantId, status: "REGISTERED" },
      }),
      this.prisma.order.count({ where: { tenantId } }),
      this.prisma.codeEvent.count({
        where: { tenantId, event: "PRINTED" },
      }),
      this.prisma.codeEvent.count({
        where: { tenantId, event: "APPLIED" },
      }),
      this.prisma.codeEvent.count({
        where: { tenantId, event: "INTRODUCED" },
      }),
      // HOME-02: live ops from existing read-model (docs / CodeEvent / Order)
      this.prisma.importDocument.findMany({
        where: { tenantId, createdAt: { gte: opsFrom } },
        select: { createdAt: true },
      }),
      this.prisma.withdrawalDocument.findMany({
        where: { tenantId, createdAt: { gte: opsFrom } },
        select: { createdAt: true },
      }),
      this.prisma.utilisationReport.findMany({
        where: { tenantId, createdAt: { gte: opsFrom } },
        select: { createdAt: true },
      }),
      this.prisma.codeEvent.findMany({
        where: { tenantId, at: { gte: opsFrom } },
        select: { at: true },
      }),
      this.prisma.order.findMany({
        where: { tenantId, createdAt: { gte: opsFrom } },
        select: { createdAt: true },
      }),
    ]);
    const failedForTenant = failedTasks.filter((t) => {
      const p = t.payload as { tenantId?: string };
      return p?.tenantId === tenantId;
    }).length;
    // HOME KPI «Требуют внимания» = OPEN Task count (same sources: outbox FAILED + alerts).
    // codesNotApplied stays on its own card — do not fold into openTasks.
    const openTasks = await this.tasks.countOpen(tenantId);
    const operationsLast7d = buildOpsLast7d(
      [
        ...importOps.map((r) => r.createdAt),
        ...withdrawalOps.map((r) => r.createdAt),
        ...utilisationOps.map((r) => r.createdAt),
        ...eventOps.map((r) => r.at),
        ...orderOps.map((r) => r.createdAt),
      ],
      now
    );
    const operationsToday = operationsLast7d[6]?.count ?? 0;
    const operationsYesterday = operationsLast7d[5]?.count ?? 0;
    return {
      codesNotApplied,
      deadlineSoon,
      openAggregates,
      docsPendingDt,
      exceptions: failedForTenant + alertsOpen,
      openTasks,
      hasCards: hasCards > 0,
      hasRegistered: hasRegistered > 0,
      hasOrders: hasOrders > 0,
      hasPrinted: hasPrinted > 0,
      hasApplied: hasApplied > 0,
      hasIntroduced: hasIntroduced > 0,
      operationsToday,
      operationsYesterday,
      operationsDeltaPct: opsDeltaPct(operationsToday, operationsYesterday),
      operationsLast7d,
    };
  }
}

export function tenantOfOrThrow(req: { tenantId?: string | null }): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}
