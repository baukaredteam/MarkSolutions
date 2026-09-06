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

export const RECENT_EVENTS_LIMIT = 10;

export type RecentEventSource = "ORDER" | "PRODUCT" | "DOCUMENT" | "CODE";

export type RecentEvent = {
  id: string;
  source: RecentEventSource;
  at: string;
  title: string;
};

const CODE_EVENT_VERB: Record<string, string> = {
  PRINTED: "напечатан",
  REPRINTED: "перепечатан",
  APPLIED: "нанесён",
  UTILISED: "зарегистрирован",
  INTRODUCED: "введён в оборот",
  EXPIRED: "истёк",
  AGGREGATED: "агрегирован",
  DISAGGREGATED: "дезагрегирован",
  WITHDRAWN: "выведен из оборота",
  WRITTEN_OFF: "списан",
};

export function cardNameOf(attributes: unknown): string {
  const name = (attributes as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.trim() ? name.trim() : "без названия";
}

export function orderRecentTitle(number: number, status: string): string {
  const verb =
    status === "ACCEPTED" || status === "SENT" || status === "PROCESSING"
      ? "принят системой"
      : status === "COMPLETED" || status === "PARTIALLY_COMPLETED"
        ? "получен из ИС МПТ"
        : status === "REJECTED" || status === "FAILED"
          ? "отклонён"
          : status === "CANCELLED"
            ? "отменён"
            : "создан";
  return `Заказ кодов №${number} ${verb}`;
}

export function productRecentTitle(name: string, status: string): string {
  const verb =
    status === "REGISTERED" || status === "APPROVED"
      ? "опубликована"
      : status === "REJECTED" || status === "NEEDS_CORRECTION"
        ? "возвращена на исправление"
        : "обновлена";
  return `Карточка ${name} ${verb}`;
}

export function documentRecentTitle(ref: string, status: string): string {
  const verb =
    status === "ERROR"
      ? "отклонён ИС МПТ"
      : status === "SUCCESS"
        ? "принят ИС МПТ"
        : "создан";
  return `Документ ${ref} ${verb}`;
}

export function codeRecentTitle(mask: string, event: string): string {
  return `Код ${mask} ${CODE_EVENT_VERB[event] ?? event}`;
}

export function mergeRecentEvents(
  items: RecentEvent[],
  limit = RECENT_EVENTS_LIMIT
): RecentEvent[] {
  return [...items]
    .sort((a, b) => {
      const dt = new Date(b.at).getTime() - new Date(a.at).getTime();
      if (dt !== 0) return dt;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, limit);
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
    const [
      recentOrders,
      recentCards,
      recentImports,
      recentWithdrawals,
      recentUtils,
      recentCodeEvents,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        take: RECENT_EVENTS_LIMIT,
        select: { id: true, number: true, status: true, updatedAt: true },
      }),
      this.prisma.productCard.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        take: RECENT_EVENTS_LIMIT,
        select: { id: true, status: true, updatedAt: true, attributes: true },
      }),
      this.prisma.importDocument.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: RECENT_EVENTS_LIMIT,
        select: {
          id: true,
          status: true,
          customsNumber: true,
          createdAt: true,
          submittedAt: true,
        },
      }),
      this.prisma.withdrawalDocument.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: RECENT_EVENTS_LIMIT,
        select: { id: true, status: true, createdAt: true, submittedAt: true },
      }),
      this.prisma.utilisationReport.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: RECENT_EVENTS_LIMIT,
        select: { id: true, status: true, reportId: true, createdAt: true },
      }),
      this.prisma.codeEvent.findMany({
        where: { tenantId },
        orderBy: { at: "desc" },
        take: RECENT_EVENTS_LIMIT,
        select: {
          id: true,
          event: true,
          at: true,
          code: { select: { mask: true } },
        },
      }),
    ]);
    const recentEvents = mergeRecentEvents([
      ...recentOrders.map((o) => ({
        id: `ORDER:${o.id}`,
        source: "ORDER" as const,
        at: o.updatedAt.toISOString(),
        title: orderRecentTitle(o.number, o.status),
      })),
      ...recentCards.map((c) => ({
        id: `PRODUCT:${c.id}`,
        source: "PRODUCT" as const,
        at: c.updatedAt.toISOString(),
        title: productRecentTitle(cardNameOf(c.attributes), c.status),
      })),
      ...recentImports.map((d) => ({
        id: `DOCUMENT:${d.id}`,
        source: "DOCUMENT" as const,
        at: (d.submittedAt ?? d.createdAt).toISOString(),
        title: documentRecentTitle(d.customsNumber, d.status),
      })),
      ...recentWithdrawals.map((d) => ({
        id: `DOCUMENT:${d.id}`,
        source: "DOCUMENT" as const,
        at: (d.submittedAt ?? d.createdAt).toISOString(),
        title: documentRecentTitle(d.id, d.status),
      })),
      ...recentUtils.map((d) => ({
        id: `DOCUMENT:${d.id}`,
        source: "DOCUMENT" as const,
        at: d.createdAt.toISOString(),
        title: documentRecentTitle(d.reportId, d.status),
      })),
      ...recentCodeEvents.map((e) => ({
        id: `CODE:${e.id}`,
        source: "CODE" as const,
        at: e.at.toISOString(),
        title: codeRecentTitle(e.code.mask, e.event),
      })),
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
      recentEvents,
    };
  }
}

export function tenantOfOrThrow(req: { tenantId?: string | null }): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}
