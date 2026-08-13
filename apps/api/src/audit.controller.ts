import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";
import { Roles, READ_ROLES } from "./guards";

function tenantOf(req: Request): string {
  const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}

// Журнал аудита (UI-SPEC §4.18): append-only лог из CodeEvent + VaultExport +
// Outbox (SEC-057 — глобальный AuditEvent эволюция). Tenant-scoped, desc.
@Injectable()
@Controller()
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles(...READ_ROLES)
  @Get("audit/journal")
  async journal(@Req() req: Request) {
    const tenantId = tenantOf(req);
    const [events, exports, outbox] = await Promise.all([
      this.prisma.codeEvent.findMany({
        where: { tenantId },
        orderBy: { at: "desc" },
        take: 100,
      }),
      this.prisma.vaultExport.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      this.prisma.outbox.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    const items: {
      id: string;
      at: string;
      actor: string;
      action: string;
      object: string;
      detail: string;
      source: string;
    }[] = [
      ...events.map((e) => ({
        id: e.id,
        at: e.at.toISOString(),
        actor: e.actor,
        action: e.event,
        object: `code:${e.codeId.slice(0, 12)}`,
        detail: [e.reasonCode, e.comment].filter(Boolean).join(" · ") || "—",
        source: "code-event",
      })),
      ...exports.map((e) => ({
        id: e.id,
        at: e.createdAt.toISOString(),
        actor: e.actor,
        action: e.kind === "print" ? "print" : "export",
        object: `order:${e.orderId.slice(0, 12)}`,
        detail: `count=${e.count}${e.reason ? ` · ${e.reason}` : ""}`,
        source: "vault-export",
      })),
      ...outbox
        .filter((o) => {
          const p = o.payload as { tenantId?: string } | null;
          return p?.tenantId === tenantId;
        })
        .map((o) => ({
          id: o.id,
          at: o.createdAt.toISOString(),
          actor: "system",
          action: o.aggregate,
          object: "outbox",
          detail: o.status,
          source: "outbox",
        })),
    ];
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return { items: items.slice(0, 200) };
  }
}
