import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { IGs1Adapter, IGS1_ADAPTER } from "./integrations";

export interface GtinResolution {
  ok: boolean;
  status: "VERIFIED" | "REJECTED" | "PENDING_REAL";
  source: "seed" | "ig" | "manual";
  brand?: string | null;
  reason?: string;
}

// GtinResolver (Q6): трёхслойный справочник GTIN.
// 1) gtin_cache: VERIFIED → OK, REJECTED → отказ;
// 2) IGs1Adapter.verify: валидный mod10 → PENDING_REAL, невалидный → REJECTED;
// 3) ручной ввод (manualVerify=true) → source="manual" + UI-бейдж.
@Injectable()
export class GtinResolver {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IGS1_ADAPTER) private readonly ig: IGs1Adapter
  ) {}

  async resolve(gtin: string, manualVerify = false): Promise<GtinResolution> {
    const cached = await this.prisma.gtinCache.findUnique({ where: { gtin } });

    // слой 1: кэш
    if (cached && !manualVerify) {
      if (cached.status === "VERIFIED") {
        return {
          ok: true,
          status: "VERIFIED",
          source: cached.source as GtinResolution["source"],
          brand: cached.brand,
        };
      }
      if (cached.status === "REJECTED") {
        return {
          ok: false,
          status: "REJECTED",
          source: cached.source as GtinResolution["source"],
          reason: `GTIN отклонён справочником (${cached.source})`,
        };
      }
      // PENDING_REAL — продолжаем на слой 2/3
    }

    // слой 3: ручной ввод — принудительно VERIFIED, source=manual
    if (manualVerify) {
      await this.prisma.gtinCache.upsert({
        where: { gtin },
        create: { gtin, status: "VERIFIED", source: "manual" },
        update: { status: "VERIFIED", source: "manual" },
      });
      return { ok: true, status: "VERIFIED", source: "manual" };
    }

    // слой 2: IG/GS1 (мок — mod10)
    const igResult = await this.ig.verify(gtin);
    await this.prisma.gtinCache.upsert({
      where: { gtin },
      create: {
        gtin,
        status: igResult.status,
        source: "ig",
        gcp: gtin.slice(0, 7),
      },
      update: {
        status: igResult.status,
        source: "ig",
        gcp: gtin.slice(0, 7),
      },
    });
    if (igResult.status === "REJECTED") {
      return {
        ok: false,
        status: "REJECTED",
        source: "ig",
        reason: "некорректный GTIN (mod 10)",
      };
    }
    return { ok: true, status: "PENDING_REAL", source: "ig" };
  }
}
