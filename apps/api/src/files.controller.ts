import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { StorageAdapter, FILE_LABELS, FileDescriptor } from "@markflow/shared";
import { activeScopeOf } from "./scoped-repository";
import { Roles } from "./guards";
import { READ_ROLES } from "./guards";
export const STORAGE_ADAPTER = "STORAGE_ADAPTER";

interface UploadedMulterFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

// Файлы соответствия карточки (T3-files, ADR-015): StorageAdapter.write →
// дескриптор {key, originalName, mimeType, contentHash:sha256, uploadedAt, label}
// в attributes.files. Клон/новая версия переиспользуют ключи (CAT-011).
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter
  ) {}

  private async getOwnedCard(tenantId: string, cardId: string) {
    const card = await this.prisma.productCard.findUnique({
      where: { id: cardId },
    });
    if (!card) throw new NotFoundException("card not found");
    if (card.tenantId !== tenantId)
      throw new ForbiddenException("no access to card");
    return card;
  }

  private descriptors(card: { attributes: unknown }): FileDescriptor[] {
    const files = (card.attributes as { files?: FileDescriptor[] }).files ?? [];
    return files;
  }

  async upload(
    tenantId: string,
    legalEntityId: string,
    cardId: string,
    label: string,
    file: UploadedMulterFile
  ) {
    if (!FILE_LABELS.includes(label as FileDescriptor["label"])) {
      throw new BadRequestException(
        `label must be one of ${FILE_LABELS.join(",")}`
      );
    }
    if (!file?.buffer) throw new BadRequestException("file required");

    const card = await this.getOwnedCard(tenantId, cardId);
    const existing = this.descriptors(card);
    // дубль label → замена, не добавление (CAT-011: замена файла → новый ключ)
    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const descriptor: FileDescriptor = {
      key: await this.storage.write(tenantId, legalEntityId, file.buffer),
      originalName: file.originalname,
      mimeType: file.mimetype,
      contentHash,
      uploadedAt: new Date().toISOString(),
      label: label as FileDescriptor["label"],
    };

    const attrs = card.attributes as Record<string, unknown>;
    // Загрузка с существующим label = ЗАМЕНА (CAT-011): тот же label, но новый ключ.
    // Полнота (фото ≥2 с разными label, согласованность декларации) — ярус B,
    // гейт при отправке/модерации через validateFiles (в validateForSubmit).
    const nextFiles = [
      ...existing.filter((f) => f.label !== descriptor.label),
      descriptor,
    ];
    await this.prisma.productCard.update({
      where: { id: cardId },
      data: {
        attributes: {
          ...attrs,
          files: nextFiles,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return descriptor;
  }

  // GET файла: доступ через карточку (tenant-проверка), сырой ключ сам по себе доступа не даёт (IDOR).
  async getFile(
    tenantId: string,
    legalEntityId: string,
    cardId: string,
    key: string
  ) {
    const card = await this.getOwnedCard(tenantId, cardId);
    const file = this.descriptors(card).find((f) => f.key === key);
    if (!file) throw new NotFoundException("file not found");
    const data = await this.storage.read(tenantId, legalEntityId, key);
    return { file, data };
  }

  // Клон карточки: те же дескрипторы (те же ключи) — CAT-011.
  async clone(tenantId: string, cardId: string) {
    const card = await this.getOwnedCard(tenantId, cardId);
    const created = await this.prisma.productCard.create({
      data: {
        tenantId,
        status: "DRAFT",
        gtin: null,
        attributes: card.attributes as unknown as Prisma.InputJsonValue,
      },
    });
    return created;
  }
}

@Controller("products/cards")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Roles("admin", "manager")
  @HttpCode(201)
  @UseInterceptors(FileInterceptor("file"))
  @Post(":id/files")
  async upload(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { label: string },
    @UploadedFile() file: UploadedMulterFile
  ) {
    const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
    if (!tenantId) throw new ForbiddenException("tenant required");
    const scope = activeScopeOf(req);
    return this.files.upload(
      scope.organizationId,
      scope.legalEntityId,
      id,
      body.label,
      file
    );
  }

  @Roles(...READ_ROLES)
  @Get(":id/files/:key")
  async getFile(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("key") key: string,
    @Res() res: Response
  ) {
    const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
    if (!tenantId) throw new ForbiddenException("tenant required");
    const scope = activeScopeOf(req);
    const { file, data } = await this.files.getFile(
      scope.organizationId,
      scope.legalEntityId,
      id,
      key
    );
    // санация имени для заголовка (защита от CRLF-инъекции через originalName)
    const safeName = file.originalName.replace(/[\r\n"]/g, "_");
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.send(data);
  }

  @Roles("admin", "manager")
  @HttpCode(201)
  @Post(":id/clone")
  async clone(@Req() req: Request, @Param("id") id: string) {
    const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
    if (!tenantId) throw new ForbiddenException("tenant required");
    return this.files.clone(tenantId, id);
  }
}
