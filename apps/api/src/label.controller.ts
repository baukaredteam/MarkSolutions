import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { PrismaService } from "./prisma.service";
import { LabelService } from "./label.service";

function tenantOf(req: Request): string {
  const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}

function actorOf(req: Request): string {
  return (req as unknown as { actor: string }).actor ?? "system";
}

// Этикетки КМ (W4-02, ADR-025): печать DataMatrix PNG (bwip-js), перепечатка
// (AT-11), скан-подтверждение нанесения (демо «этикетка + скан»).
@Controller()
export class LabelController {
  constructor(
    private readonly labels: LabelService,
    private readonly prisma: PrismaService
  ) {}

  // POST /labels/:codeKey/print — первая печать (PRINTED-event, write-through)
  @HttpCode(200)
  @Post("labels/:codeKey/print")
  print(@Req() req: Request, @Param("codeKey") codeKey: string) {
    return this.labels.print(tenantOf(req), codeKey, actorOf(req));
  }

  // POST /labels/:codeKey/reprint — перепечатка с обязательной причиной (AT-11)
  @HttpCode(200)
  @Post("labels/:codeKey/reprint")
  reprint(
    @Req() req: Request,
    @Param("codeKey") codeKey: string,
    @Body() body: { reasonCode: string; comment?: string }
  ) {
    return this.labels.reprint(
      tenantOf(req),
      codeKey,
      actorOf(req),
      body.reasonCode,
      body.comment
    );
  }

  // POST /codes/:codeKey/apply — скан-подтверждение: PNG → decode → deepEqual
  @HttpCode(200)
  @Post("codes/:codeKey/apply")
  apply(
    @Req() req: Request,
    @Param("codeKey") codeKey: string,
    @Body() body: { png: string }
  ) {
    if (!body?.png) throw new NotFoundException("png required");
    return this.labels.apply(tenantOf(req), codeKey, actorOf(req), body.png);
  }
}
