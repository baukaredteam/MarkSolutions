import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { AuthService } from "./auth.service";

// Seed (идемпотентно): оператор модерации operator@markflow и справочные GTIN
// в gtin_cache (RAVENOL, codes_success — статус VERIFIED, source="seed").
@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seed();
    } catch (e) {
      // схема не развёрнута (например, seam-тест с пустой БД) — seed пропускаем
      this.logger.warn(
        `seed skipped: ${(e as Error).message?.slice(0, 120) ?? e}`
      );
    }
  }

  private async seed(): Promise<void> {
    const operator = await this.prisma.user.findUnique({
      where: { login: "operator@markflow" },
    });
    if (!operator) {
      await this.prisma.user.create({
        data: {
          tenantId: null,
          login: "operator@markflow",
          passwordHash: AuthService.hashPassword("demo-password"),
          roles: JSON.stringify(["operator"]),
        },
      });
    }

    const seeds: { gtin: string; gcp: string; brand: string }[] = [
      { gtin: "04014835723399", gcp: "0401483", brand: "RAVENOL" },
      { gtin: "04870267100135", gcp: "0487026", brand: "codes_success" },
    ];
    for (const s of seeds) {
      const exists = await this.prisma.gtinCache.findUnique({
        where: { gtin: s.gtin },
      });
      if (!exists) {
        await this.prisma.gtinCache.create({
          data: {
            gtin: s.gtin,
            gcp: s.gcp,
            brand: s.brand,
            status: "VERIFIED",
            source: "seed",
          },
        });
      }
    }

    // Тариф на КМ (W3, ADR-024): одна активная строка; значение задаёт бизнес.
    // Дефолт 100 KZT = 10000 тийын за код (меняется через seed/скрипт, админ-UI нет).
    const now = new Date();
    const activeTariff = await this.prisma.tariff.findFirst({
      where: { validFrom: { lte: now }, validTo: { gte: now } },
    });
    if (!activeTariff) {
      await this.prisma.tariff.create({
        data: {
          validFrom: new Date(Date.now() - 86400000),
          validTo: new Date(Date.now() + 30 * 86400000),
          pricePerCodeKZT: BigInt(10000),
          unit: "KM",
          currency: "KZT",
        },
      });
    }
  }
}
