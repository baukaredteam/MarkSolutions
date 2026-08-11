import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PrismaService } from "./prisma.service";
import { gs1Mod10CheckDigit, verifyGs1Mod10 } from "@markflow/shared";

// Машина статусов КМ (ADR-025): MVP-набор. CodeVault.status — write-through
// при записи CodeEvent; REPRINTED/DISAGGREGATED — события БЕЗ смены статуса.
const EVENT_TYPES = [
  "PRINTED",
  "REPRINTED",
  "APPLIED",
  "AGGREGATED",
  "DISAGGREGATED",
  "UTILISED",
  "INTRODUCED",
  "EXPIRED",
  "WITHDRAWN",
  "WRITTEN_OFF",
] as const;
type CodeEventType = (typeof EVENT_TYPES)[number];

// переходим из текущего статуса в целевой по событию
const TRANSITIONS: Record<string, string[]> = {
  ACTIVE: ["PRINTED", "WITHDRAWN", "WRITTEN_OFF", "EXPIRED", "AGGREGATED"],
  PRINTED: ["APPLIED", "REPRINTED", "WITHDRAWN", "WRITTEN_OFF", "EXPIRED"],
  APPLIED: [
    "UTILISED",
    "INTRODUCED",
    "WITHDRAWN",
    "WRITTEN_OFF",
    "EXPIRED",
    "AGGREGATED",
  ],
  UTILISED: [],
  INTRODUCED: ["WITHDRAWN", "WRITTEN_OFF"],
  AGGREGATED: ["DISAGGREGATED", "APPLIED", "WITHDRAWN", "WRITTEN_OFF"],
  EXPIRED: [],
  WITHDRAWN: [],
  WRITTEN_OFF: [],
};

export interface RecordEventOptions {
  reasonCode?: string | null;
  comment?: string | null;
  relatedId?: string | null;
}

@Injectable()
export class CodeEventService {
  constructor(private readonly prisma: PrismaService) {}

  // append-only запись события + write-through CodeVault.status
  async recordEvent(
    tenantId: string,
    codeId: string,
    actor: string,
    event: CodeEventType,
    opts: RecordEventOptions = {}
  ) {
    if (!EVENT_TYPES.includes(event)) {
      throw new BadRequestException(`unknown event: ${event}`);
    }
    const code = await this.prisma.codeVault.findFirst({
      where: { id: codeId, tenantId },
    });
    if (!code) throw new NotFoundException("code not found");

    const target = this.targetStatus(event);
    if (target && !TRANSITIONS[code.status]?.includes(target)) {
      throw new BadRequestException(
        `недопустимый переход ${code.status} → ${target} (${event})`
      );
    }

    const evt = await this.prisma.codeEvent.create({
      data: {
        tenantId,
        codeId,
        event,
        at: new Date(),
        actor,
        reasonCode: opts.reasonCode ?? null,
        comment: opts.comment ?? null,
        relatedId: opts.relatedId ?? null,
      },
    });
    if (target) {
      await this.prisma.codeVault.update({
        where: { id: codeId },
        data: { status: target },
      });
    }
    return evt;
  }

  // событие → целевой статус (null = статус не меняется)
  private targetStatus(event: CodeEventType): string | null {
    const map: Record<CodeEventType, string | null> = {
      PRINTED: "PRINTED",
      REPRINTED: null,
      APPLIED: "APPLIED",
      AGGREGATED: "AGGREGATED",
      DISAGGREGATED: null,
      UTILISED: "UTILISED",
      INTRODUCED: "INTRODUCED",
      EXPIRED: "EXPIRED",
      WITHDRAWN: "WITHDRAWN",
      WRITTEN_OFF: "WRITTEN_OFF",
    };
    return map[event];
  }

  // SSCC (ADR-025 Q4): "0" + gcp(7 цифр от sha256(tenantId)) + seq(9) + mod10
  tenantSsscPrefix(tenantId: string): string {
    const hash = createHash("sha256").update(tenantId).digest();
    const gcp = Number(hash.readUInt32BE(0)) % 10000000; // 7 цифр
    return String(gcp).padStart(7, "0");
  }

  generateSssc(tenantId: string, seq: number): string {
    const gcp = this.tenantSsscPrefix(tenantId);
    const base = `0${gcp}${String(seq).padStart(9, "0")}`;
    const check = gs1Mod10CheckDigit(base);
    return `${base}${check}`;
  }

  verifySssc(sscc: string): boolean {
    return verifyGs1Mod10(sscc, 18);
  }
}
