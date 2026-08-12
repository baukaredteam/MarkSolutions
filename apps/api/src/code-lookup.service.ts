import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { VaultService } from "./vault.service";

// UI-03: поиск КМ по codeKey / raw-КМ / GTIN (tenant-scoped, IDOR → 404).
@Injectable()
export class CodeLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService
  ) {}

  async lookup(tenantId: string, code: string) {
    const { gtin, serial, codeId } = await this.resolve(tenantId, code);
    const row = codeId
      ? await this.prisma.codeVault.findFirst({
          where: { id: codeId, tenantId },
        })
      : null;
    if (row) return await this.build(tenantId, row);

    // gtin-поиск (или gtin+serial для raw): первый подходящий код
    if (gtin) {
      const byGtin = await this.prisma.codeVault.findFirst({
        where: { tenantId, gtin },
        orderBy: { createdAt: "asc" },
      });
      if (byGtin) {
        // raw с serial: сверим дешифрованный serial
        if (serial) {
          const revealed = await this.vault
            .revealOne(byGtin.id, tenantId)
            .catch(() => null);
          if (revealed && revealed.serial === serial) {
            return await this.build(tenantId, byGtin);
          }
          throw new NotFoundException("code not found");
        }
        return await this.build(tenantId, byGtin);
      }
    }
    throw new NotFoundException("code not found");
  }

  // определить цель: raw-КМ / GTIN / codeKey
  private async resolve(
    tenantId: string,
    code: string
  ): Promise<{ gtin?: string; serial?: string; codeId?: string }> {
    void tenantId;
    const raw = code.trim();
    // raw-КМ: 01{gtin14}21{serial...}
    if (raw.startsWith("01") && raw.includes("21") && raw.length >= 18) {
      const gtin = raw.slice(2, 16);
      const serial = raw.slice(raw.indexOf("21") + 2);
      return { gtin, serial };
    }
    // 14 цифр → GTIN
    if (/^\d{14}$/.test(raw)) return { gtin: raw };
    // иначе codeKey
    return { codeId: raw };
  }

  private async build(
    tenantId: string,
    row: {
      id: string;
      gtin: string;
      status: string;
      cardId: string | null;
      ciphertext: string;
    }
  ) {
    // дешифровать serial (маска)
    const revealed = await this.vault
      .revealOne(row.id, tenantId)
      .catch(() => null);
    const serial = revealed?.serial ?? "";
    const serialMask =
      serial.length > 6
        ? `${serial.slice(0, 2)}…${serial.slice(-2)}`
        : serial.length > 0
          ? "••••"
          : "";
    const card = row.cardId
      ? await this.prisma.productCard.findUnique({ where: { id: row.cardId } })
      : null;
    const productName =
      ((card?.attributes as Record<string, unknown>)?.name as string) ?? null;
    const history = await this.prisma.codeEvent.findMany({
      where: { tenantId, codeId: row.id },
      orderBy: { at: "asc" },
      select: { at: true, event: true, reasonCode: true },
    });
    return {
      codeKey: row.id,
      gtin: row.gtin,
      serialMask,
      status: row.status,
      productName,
      owner: null,
      history,
    };
  }
}

export function tenantOf(req: { tenantId?: string | null }): string {
  const tenantId = req.tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}
