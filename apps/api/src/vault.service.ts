import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { IKmsAdapter, KMS_ADAPTER } from "./kms.adapter";

// структура КМ (ADR-006): {gtin, serial, ai91, ai92}, form base|extended
export interface VaultCode {
  gtin: string;
  serial: string;
  ai91: string | null;
  ai92: string | null;
  form: "base" | "extended";
}

// Code Vault (W3, CV-030..033): gtin открыт, {serial,ai91,ai92} зашифрованы.
@Injectable()
export class VaultService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(KMS_ADAPTER) private readonly kms: IKmsAdapter
  ) {}

  // маска CV-031: gtin открыт + serial «первые2 + … + последние2» при length>6, иначе полностью скрыт
  maskOf(gtin: string, serial: string): string {
    let sm = "••••";
    if (serial.length > 6) sm = `${serial.slice(0, 2)}…${serial.slice(-2)}`;
    return `${gtin}:${sm}`;
  }

  private async seal(code: VaultCode): Promise<string> {
    const { ciphertext } = await this.kms.encrypt(
      Buffer.from(
        JSON.stringify({
          serial: code.serial,
          ai91: code.ai91,
          ai92: code.ai92,
        })
      )
    );
    return ciphertext.toString("base64");
  }

  private async open(
    sealed: string
  ): Promise<{ serial: string; ai91: string | null; ai92: string | null }> {
    const { plaintext } = await this.kms.decrypt(Buffer.from(sealed, "base64"));
    return JSON.parse(plaintext.toString("utf8"));
  }

  // инджест кодов из симулятора (граница с тикетом 03): COMPLETED → все, PARTIALLY → сколько пришло
  async ingest(
    orderId: string,
    codes: VaultCode[],
    cardId: string | null
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException("order not found");
    const existing = await this.prisma.codeVault.count({ where: { orderId } });
    if (existing > 0) return; // идемпотентно (поллер повторяет)
    for (const c of codes) {
      await this.prisma.codeVault.create({
        data: {
          orderId,
          tenantId: order.tenantId,
          cardId,
          gtin: c.gtin,
          mask: this.maskOf(c.gtin, c.serial),
          status: "ACTIVE",
          ciphertext: await this.seal(c),
        },
      });
    }
  }

  // дешифрованный КМ (полный — только печать/экспорт, CV-031)
  async reveal(orderId: string, tenantId: string): Promise<VaultCode[]> {
    const rows = await this.prisma.codeVault.findMany({
      where: { orderId, tenantId },
    });
    if (rows.length === 0)
      throw new NotFoundException("order not found or no codes");
    const out: VaultCode[] = [];
    for (const r of rows) {
      const { serial, ai91, ai92 } = await this.open(r.ciphertext);
      out.push({ gtin: r.gtin, serial, ai91, ai92, form: "base" });
    }
    return out;
  }

  // дешифрованный КМ по codeId (W4-02, печать/скан одного кода)
  async revealOne(codeId: string, tenantId: string): Promise<VaultCode> {
    const row = await this.prisma.codeVault.findFirst({
      where: { id: codeId, tenantId },
    });
    if (!row) throw new NotFoundException("code not found");
    const { serial, ai91, ai92 } = await this.open(row.ciphertext);
    const card = row.cardId
      ? await this.prisma.productCard.findUnique({ where: { id: row.cardId } })
      : null;
    return this.withExtended(
      { gtin: row.gtin, serial, ai91, ai92, form: "base" },
      card
    );
  }

  // индивидуальные коды заказа для печати (W4-02): id/mask/status, без serial
  async codesByOrder(
    orderId: string,
    tenantId: string
  ): Promise<{ id: string; gtin: string; mask: string; status: string }[]> {
    const rows = await this.prisma.codeVault.findMany({
      where: { orderId, tenantId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      gtin: r.gtin,
      mask: r.mask,
      status: r.status,
    }));
  }

  // маски для GET /api/codes (без полных serial)
  async masks(
    tenantId: string
  ): Promise<
    { gtin: string; mask: string; status: string; orderId: string }[]
  > {
    const rows = await this.prisma.codeVault.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({
      gtin: r.gtin,
      mask: r.mask,
      status: r.status,
      orderId: r.orderId,
    }));
  }

  // расширенный рендер ADR-006: если KMS_EXTENDED_CODES=true, дополняем ai91/ai92
  // (tenant-специфичные данные; дефолт — пустые, форма base сохраняется)
  private async withExtended(
    code: VaultCode,
    card: { attributes: Prisma.JsonValue } | null
  ): Promise<VaultCode> {
    if (process.env.KMS_EXTENDED_CODES !== "true") return code;
    const attrs = (card?.attributes as Record<string, unknown>) ?? {};
    return {
      ...code,
      ai91: code.ai91 ?? String(attrs.gtin ?? code.gtin),
      ai92: code.ai92 ?? String(attrs.tnved ?? ""),
      form: "extended",
    };
  }

  async revealForExport(
    orderId: string,
    tenantId: string,
    cardId: string | null
  ): Promise<VaultCode[]> {
    const rows = await this.prisma.codeVault.findMany({
      where: { orderId, tenantId },
    });
    if (rows.length === 0)
      throw new NotFoundException("order not found or no codes");
    const card = cardId
      ? await this.prisma.productCard.findUnique({ where: { id: cardId } })
      : null;
    const out: VaultCode[] = [];
    for (const r of rows) {
      const { serial, ai91, ai92 } = await this.open(r.ciphertext);
      out.push(
        await this.withExtended(
          { gtin: r.gtin, serial, ai91, ai92, form: "base" },
          card
        )
      );
    }
    return out;
  }

  async logExport(
    tenantId: string,
    orderId: string,
    actor: string,
    kind: "export" | "print",
    count: number,
    reason?: string
  ): Promise<void> {
    await this.prisma.vaultExport.create({
      data: { tenantId, orderId, actor, kind, reason: reason ?? null, count },
    });
  }
}
