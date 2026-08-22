import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { StorageAdapter } from "@markflow/shared";
import { STORAGE_ADAPTER } from "./files.controller";
import { PrismaService } from "./prisma.service";
import { VaultService } from "./vault.service";
import { CodeEventService } from "./code-event.service";

// DataMatrix ECC200 roundtrip (ADR-025): bwip-js генерит PNG, ZXing-WASM читает.
// Каноническая raw-строка ADR-006: 01{gtin}21{serial} + [GS]91{ai91} + [GS]92{ai92}.
// Вход bwip-js: текстовая строка (байт 0x1D = GS); вход apply: PNG base64 → байты.

export interface LabelPrintResult {
  key: string;
  pngBase64: string;
  contentHash: string;
  eventId: string;
  status: string;
}

const REPRINT_REASONS = [
  "PRINT_DEFECT",
  "DAMAGED_BEFORE_APPLY",
  "LOST_LABEL",
  "OTHER",
] as const;

// каноническая raw-строка ADR-006 с реальным байтом 0x1D (не текстовым <GS>)
export function rawStringOf(code: {
  gtin: string;
  serial: string;
  ai91: string | null;
  ai92: string | null;
  form: string;
}): string {
  let s = `01${code.gtin}21${code.serial}`;
  if (code.form === "extended") {
    if (code.ai91) s += `\x1d91${code.ai91}`;
    if (code.ai92) s += `\x1d92${code.ai92}`;
  }
  return s;
}

@Injectable()
export class LabelService {
  private zxingReady: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vault: VaultService,
    private readonly events: CodeEventService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter
  ) {}

  // ленивая инициализация ZXing-WASM (Node: былBinary локально, не CDN)
  private async ensureZxing(): Promise<void> {
    if (this.zxingReady) return this.zxingReady;
    this.zxingReady = (async () => {
      const mod = await import("@sec-ant/zxing-wasm");
      const req = createRequire(join(process.cwd(), "package.json"));
      const pkg = req.resolve("@sec-ant/zxing-wasm");
      const wasmPath = join(dirname(pkg), "zxing_full.wasm");
      const wasmFile = await readFile(wasmPath);
      const wasmBinary = wasmFile.buffer.slice(
        wasmFile.byteOffset,
        wasmFile.byteOffset + wasmFile.byteLength
      ) as ArrayBuffer;
      await mod.getZXingModule({
        wasmBinary,
        locateFile: (f) => f,
      });
    })();
    return this.zxingReady;
  }

  // bwip-js → PNG DataMatrix ECC200. raw — каноническая строка с 0x1D.
  // padding (quiet zone в модулях) поддерживается рантаймом, в типах отсутствует.
  async renderPng(raw: string): Promise<Buffer> {
    const bwipjs = await import("bwip-js");
    const toBuffer = bwipjs.toBuffer as unknown as (opts: {
      bcid: string;
      text: string;
      parsefnc?: boolean;
      includetext?: boolean;
      scale?: number;
      padding?: number;
      backgroundcolor?: string;
    }) => Promise<Buffer>;
    return toBuffer({
      bcid: "datamatrix",
      text: raw,
      parsefnc: true,
      includetext: false,
      scale: 4,
      padding: 4,
      backgroundcolor: "ffffff",
    });
  }

  // PNG → сырые байты (DataMatrix, с байтом 0x1D на месте GS)
  async decodePng(png: Buffer): Promise<Buffer> {
    await this.ensureZxing();
    try {
      const mod = await import("@sec-ant/zxing-wasm");
      const blob = new Blob([new Uint8Array(png)], { type: "image/png" });
      const out = await mod.readBarcodesFromImageFile(blob, {
        tryHarder: true,
        formats: ["DataMatrix"],
      });
      if (!out.length) throw new BadRequestException("DataMatrix не распознан");
      return Buffer.from(out[0].bytes);
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(`скан не читается: ${String(e)}`);
    }
  }

  // ADR-027: печать возможна только для кода с валидированным юрлицом.
  private requireLe(row: { legalEntityId: string | null }): string {
    if (!row.legalEntityId)
      throw new ConflictException("code has no active legal entity scope");
    return row.legalEntityId;
  }

  private contentHash(png: Buffer): string {
    return createHash("sha256").update(png).digest("hex");
  }

  // content-addressed key: существующая этикетка (тот же PNG) или новая запись
  private async labelKeyFor(
    tenantId: string,
    legalEntityId: string,
    codeKey: string,
    existing: string | null,
    png: Buffer
  ): Promise<string> {
    if (existing) return existing;
    const key = await this.storage.write(tenantId, legalEntityId, png);
    await this.prisma.codeVault.update({
      where: { id: codeKey },
      data: { labelKey: key },
    });
    return key;
  }

  // печать: render → storage (content-addressed) → PRINTED-event (write-through)
  async print(
    tenantId: string,
    codeKey: string,
    actor: string
  ): Promise<LabelPrintResult> {
    const row = await this.prisma.codeVault.findFirst({
      where: { id: codeKey, tenantId },
    });
    if (!row) throw new NotFoundException("code not found");
    if (row.status !== "ACTIVE")
      throw new ConflictException(`код уже ${row.status}, печать невозможна`);
    const code = await this.vault.revealOne(codeKey, tenantId);
    const raw = rawStringOf(code);
    const png = await this.renderPng(raw);
    const key = await this.labelKeyFor(
      tenantId,
      this.requireLe(row),
      codeKey,
      row.labelKey,
      png
    );
    const evt = await this.events.recordEvent(
      tenantId,
      codeKey,
      actor,
      "PRINTED"
    );
    return {
      key,
      pngBase64: png.toString("base64"),
      contentHash: this.contentHash(png),
      eventId: evt.id,
      status: "PRINTED",
    };
  }

  // перепечатка (AT-11): та же этикетка (тот же key), обязательная причина
  async reprint(
    tenantId: string,
    codeKey: string,
    actor: string,
    reasonCode: string,
    comment?: string
  ): Promise<LabelPrintResult> {
    const row = await this.prisma.codeVault.findFirst({
      where: { id: codeKey, tenantId },
    });
    if (!row) throw new NotFoundException("code not found");
    if (row.status !== "ACTIVE" && row.status !== "PRINTED")
      throw new ConflictException("требуется перемаркировка (код уже нанесён)");
    if (!(REPRINT_REASONS as readonly string[]).includes(reasonCode))
      throw new BadRequestException(
        `reasonCode должен быть ${REPRINT_REASONS.join("|")}`
      );
    if (reasonCode === "OTHER" && (!comment || comment.trim().length < 5))
      throw new BadRequestException(
        "для OTHER требуется comment (мин. 5 символов)"
      );
    const code = await this.vault.revealOne(codeKey, tenantId);
    const png = await this.renderPng(rawStringOf(code));
    const key = await this.labelKeyFor(
      tenantId,
      this.requireLe(row),
      codeKey,
      row.labelKey,
      png
    );
    const evt = await this.events.recordEvent(
      tenantId,
      codeKey,
      actor,
      "REPRINTED",
      {
        reasonCode,
        comment: comment ?? null,
      }
    );
    return {
      key,
      pngBase64: png.toString("base64"),
      contentHash: this.contentHash(png),
      eventId: evt.id,
      status: row.status,
    };
  }

  // скан-подтверждение (демо «этикетка + скан»): PNG → байты → deepEqual с Vault
  async apply(
    tenantId: string,
    codeKey: string,
    actor: string,
    pngBase64: string
  ) {
    const row = await this.prisma.codeVault.findFirst({
      where: { id: codeKey, tenantId },
    });
    if (!row) throw new NotFoundException("code not found");
    const png = Buffer.from(pngBase64, "base64");
    const scanned = await this.decodePng(png);
    const code = await this.vault.revealOne(codeKey, tenantId);
    const expected = Buffer.from(rawStringOf(code), "latin1");
    if (!scanned.equals(expected)) {
      throw new BadRequestException("скан не совпадает с кодом (mismatch)");
    }
    const evt = await this.events.recordEvent(
      tenantId,
      codeKey,
      actor,
      "APPLIED"
    );
    return { eventId: evt.id, status: "APPLIED" };
  }
}
