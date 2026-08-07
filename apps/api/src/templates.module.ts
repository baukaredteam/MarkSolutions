import {
  Controller,
  Get,
  Module,
  Param,
  NotFoundException,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "./public.decorator";
import { templateFor } from "@markflow/shared";

const XLSX_CT =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

@Controller("templates")
export class TemplatesController {
  @Public()
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
