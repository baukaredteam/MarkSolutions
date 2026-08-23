import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { DocumentService } from "./document.service";
import { Roles } from "./guards";
import { READ_ROLES } from "./guards";
import { activeScopeOf } from "./scoped-repository";

function tenantOf(req: Request): string {
  const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}

@Injectable()
@Controller()
export class DocumentController {
  constructor(private readonly documents: DocumentService) {}

  // Q5: импорт партии по ДТ
  @Roles("admin", "manager", "marking")
  @HttpCode(201)
  @Post("import")
  submitImport(
    @Req() req: Request,
    @Body()
    body: {
      orderId: string;
      customsDeclaration: {
        date?: string;
        number?: string;
        authorityCode?: string;
      };
    }
  ) {
    const scope = activeScopeOf(req);
    return this.documents.submitImport(
      scope.organizationId,
      scope.legalEntityId,
      body
    );
  }

  // Q9: вывод из оборота / списание
  @Roles("admin", "manager", "marking")
  @HttpCode(201)
  @Post("withdrawal")
  submitWithdrawal(
    @Req() req: Request,
    @Body()
    body: {
      codes: (string | { code: string; partialQuantity?: number })[];
      withdrawalType: string;
      withdrawalReason: string;
      comment?: string;
      childrenWriteOff?: boolean;
      primaryDocument?: { type?: string; date?: string; number?: string };
    }
  ) {
    const scope = activeScopeOf(req);
    return this.documents.submitWithdrawal(
      scope.organizationId,
      scope.legalEntityId,
      body
    );
  }

  // дашборд: все документы tenant
  @Roles(...READ_ROLES)
  @Get("documents")
  list(@Req() req: Request) {
    return this.documents.list(tenantOf(req));
  }
}
