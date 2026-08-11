import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Injectable,
  Post,
  Req,
  Headers,
} from "@nestjs/common";
import type { Request } from "express";
import { UtilisationService } from "./utilisation.service";

function tenantOf(req: Request): string {
  const tenantId = (req as unknown as { tenantId: string | null }).tenantId;
  if (!tenantId) throw new ForbiddenException("tenant required");
  return tenantId;
}

@Injectable()
@Controller("utilisation")
export class UtilisationController {
  constructor(private readonly utilisation: UtilisationService) {}

  @HttpCode(201)
  @Post()
  async submit(
    @Req() req: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body()
    body: {
      orderId: string;
      releaseType: string;
      expirationDate?: string;
      productionDate?: string;
      manufacturerCountry?: string;
    }
  ) {
    return this.utilisation.submit(tenantOf(req), idempotencyKey ?? "", body);
  }
}
