import {
  Controller,
  Get,
  Module,
  Param,
  NotFoundException,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { templateFor } from "@markflow/shared";
import { Roles } from "./guards";
import { READ_ROLES } from "./guards";

const XLSX_CT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// GET /templates требует JWT (ADR-017: не входит в 3 публичных роута).
// Tenant-guard глобальный в AppModule; шаблон per-product-group одинаков для всех tenant.
@Controller("templates")
export class TemplatesController {
  @Roles(...READ_ROLES)
  @Get(":productGroup")
  get(@Param("productGroup") group: string, @Res() res: Response) {
    const xlsx = templateFor(group);
    if (!xlsx) throw new NotFoundException("template not found");
    res.setHeader("Content-Type", XLSX_CT);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${group}-v1.xlsx"`
    );
    res.send(xlsx);
  }
}

@Module({
  controllers: [TemplatesController],
})
export class TemplatesModule {}
