import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
} from "@nestjs/common";
import { BadRequestException, UseGuards } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const tenantId = req.headers["x-tenant-id"];
    if (!tenantId) {
      throw new BadRequestException("tenant_id required");
    }
    return true;
  }
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    let db = "ok";
    let detail = "";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      db = "error";
      detail = String((e as Error).message).slice(0, 120);
    }
    return { status: "ok", db, detail };
  }
}

@Controller("api/products")
@UseGuards(TenantGuard)
export class ProductsController {
  @Get()
  list() {
    return { items: [] };
  }
}

@Module({
  controllers: [HealthController, ProductsController],
  providers: [PrismaService],
})
export class AppModule {}
