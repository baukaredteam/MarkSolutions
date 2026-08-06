import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  SetMetadata,
  CustomDecorator,
} from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "./prisma.service";
import { AllExceptionsFilter } from "./exception.filter";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = (): CustomDecorator => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

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

  @Public()
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
export class ProductsController {
  @Get()
  list() {
    return { items: [] };
  }
}

@Module({
  controllers: [HealthController, ProductsController],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
