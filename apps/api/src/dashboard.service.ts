import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// Дашборд «Следующие действия» (W4-06, Q10, ADR-025): ОДИН снимок 5 счётчиков.
// openAggregates и serviceActExport = 0 в MVP (тикеты 03/05 stretch после демо).
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private get deadlineDays(): number {
    return Number(process.env.UTIL_DEADLINE_DAYS ?? 30);
  }

  // Q10: 5 счётчиков одним снимком (Promise.all — атомарная согласованность по смыслу)
  async summary(tenantId: string) {
    const cutoff = new Date(Date.now() - (this.deadlineDays - 7) * 86400000);
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
    ]);
    const failedForTenant = failedTasks.filter((t) => {
      const p = t.payload as { tenantId?: string };
      return p?.tenantId === tenantId;
    }).length;
    return {
      codesNotApplied,
      deadlineSoon,
      openAggregates,
      docsPendingDt,
      exceptions: failedForTenant + alertsOpen,
      hasCards: hasCards > 0,
      hasRegistered: hasRegistered > 0,
      hasOrders: hasOrders > 0,
      hasPrinted: hasPrinted > 0,
      hasApplied: hasApplied > 0,
      hasIntroduced: hasIntroduced > 0,
    };
  }
}

export function tenantOfOrThrow(req: { tenantId?: string | null }): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}
