import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "./prisma.service";
import { AllExceptionsFilter } from "./exception.filter";
import { TenantGuard, RolesGuard, Roles } from "./guards";
import { Public } from "./public.decorator";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import {
  OnboardingController,
  OperatorApprovalsController,
} from "./onboarding.controller";
import { MockEcomAdapter, ECOM_ADAPTER } from "./ecom.adapter";
import { TemplatesController } from "./templates.module";
import {
  CatalogController,
  DemoController,
  CatalogService,
} from "./catalog.controller";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";
import { GtinResolver } from "./gtin-resolver";
import { OutboxPoller } from "./outbox-poller";
import { SeedService } from "./seed.service";
import {
  MockGs1Adapter,
  MockNktAdapter,
  IGS1_ADAPTER,
  NKT_ADAPTER,
} from "./integrations";

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

@Controller("api/admin")
export class AdminController {
  @Roles("admin")
  @Get("probe")
  probe() {
    return { ok: true };
  }
}

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-secret",
      signOptions: { expiresIn: "1h" },
    }),
  ],
  controllers: [
    HealthController,
    ProductsController,
    AdminController,
    AuthController,
    OnboardingController,
    OperatorApprovalsController,
    TemplatesController,
    CatalogController,
    DemoController,
    ModerationController,
  ],
  providers: [
    PrismaService,
    AuthService,
    CatalogService,
    ModerationService,
    GtinResolver,
    OutboxPoller,
    SeedService,
    { provide: ECOM_ADAPTER, useClass: MockEcomAdapter },
    { provide: IGS1_ADAPTER, useClass: MockGs1Adapter },
    { provide: NKT_ADAPTER, useClass: MockNktAdapter },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    Reflector,
  ],
})
export class AppModule {
  constructor(private readonly poller: OutboxPoller) {
    this.poller.start();
  }
}
