import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { ECOM_ADAPTER, IEcomAdapter } from "./ecom.adapter";
import { CatalogService } from "./catalog.controller";
import { Roles } from "./guards";
import { activeScopeOf } from "./scoped-repository";

function tenantOf(req: Request): string {
  const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}

// W5-01: 1ecom товары → DraftProposal(source="1ecom"). Мок listProducts (5–10 позиций).
@Injectable()
@Controller("products/ecom")
export class EcomProductsController {
  constructor(
    @Inject(ECOM_ADAPTER) private readonly ecom: IEcomAdapter,
    private readonly catalog: CatalogService
  ) {}

  @Roles("admin", "manager")
  @Get("products")
  async products(@Req() req: Request) {
    tenantOf(req);
    return { items: await this.ecom.listProducts() };
  }

  @Roles("admin", "manager")
  @HttpCode(201)
  @Post("import")
  async importProducts(
    @Req() req: Request,
    @Body()
    body: {
      items: {
        gtin: string;
        tnved?: string;
        name?: string;
        brand?: string;
        sae?: string;
        volumeL?: number;
      }[];
    }
  ) {
    const scope = activeScopeOf(req);
    let created = 0;
    for (const it of body.items ?? []) {
      await this.catalog.createDraft(scope, {
        gtin: it.gtin,
        tnved: it.tnved,
        name: it.name,
        brand: it.brand,
        sae: it.sae,
        volumeL: it.volumeL,
        source: "1ecom",
      });
      created++;
    }
    return { created };
  }
}
