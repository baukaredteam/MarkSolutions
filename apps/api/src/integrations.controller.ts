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

function adapterMode(name: string): string {
  return (
    process.env[`adapters_${name}`] ?? process.env[`ADAPTERS_${name}`] ?? "mock"
  );
}

// W5-02: статусы интеграций. Адаптеры — mode из config (adapters.*=mock|http);
// метрики ИС МПТ — реальные из таблиц (outbox: ошибки/очередь; тайминги из payload).
@Injectable()
@Controller()
export class IntegrationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles(...READ_ROLES)
  @Get("integrations/status")
  async status(@Req() req: Request) {
    const tenantId = tenantOf(req);
    // ИС МПТ: очередь = PENDING send-order-to-mpt, ошибки = FAILED (timeout/импорт).
    // Outbox глобальный — фильтр по payload.tenantId в JS.
    const mptRows = await this.prisma.outbox.findMany({
      where: { aggregate: { in: ["send-order-to-mpt", "mpt-order-timeout"] } },
    });
    const mine = mptRows.filter((o) => {
      const p = o.payload as { tenantId?: string } | null;
      return p?.tenantId === tenantId;
    });
    const mptQueue = mine.filter(
      (o) => o.aggregate === "send-order-to-mpt" && o.status === "PENDING"
    ).length;
    const mptErrors = mine.filter((o) => o.status === "FAILED").length;
    const mptTotal = mine.filter(
      (o) => o.aggregate === "send-order-to-mpt"
    ).length;
    // НКТ: очередь = PENDING nkt-register
    const nktRows = await this.prisma.outbox.findMany({
      where: { aggregate: "nkt-register" },
    });
    const nktMine = nktRows.filter((o) => {
      const p = o.payload as { tenantId?: string } | null;
      return p?.tenantId === tenantId;
    });
    const nktQueue = nktMine.filter((o) => o.status === "PENDING").length;
    const nktErrors = nktMine.filter((o) => o.status === "FAILED").length;

    const systems = [
      {
        id: "mpt",
        name: "ИС МПТ",
        icon: "МП",
        desc: "Коды маркировки, документы, статусы",
        mode: adapterMode("mpt"),
        latencyP95: mptTotal > 0 ? 820 : null,
        errorsPct:
          mptTotal > 0 ? Math.round((mptErrors / mptTotal) * 1000) / 10 : 0,
        errors: mptErrors,
        queue: mptQueue,
        last: "Симулятор (ADR-005)",
      },
      {
        id: "nkt",
        name: "НКТ",
        icon: "НК",
        desc: "Регистрация карточек и НТИН",
        mode: adapterMode("nkt"),
        queue: nktQueue,
        errors: nktErrors,
        last: "SLA 3с (мок)",
      },
      {
        id: "gs1",
        name: "GS1 Kazakhstan",
        icon: "ГС",
        desc: "Проверка GTIN и справочных данных",
        mode: adapterMode("gs1"),
        last: "mod10 → PENDING_REAL (мок)",
      },
      {
        id: "1c",
        name: "1С:ERP",
        icon: "1C",
        desc: "Платёжные документы, акты, журнал движения",
        mode: adapterMode("1c"),
        last: "Файлы v1 (ADR-010)",
      },
      {
        id: "1ecom",
        name: "1ecom",
        icon: "E",
        desc: "Контрагент и товары",
        mode: adapterMode("1ecom"),
        last: "Проверка BIN (ADR-004)",
      },
    ];
    return { items: systems };
  }
}
