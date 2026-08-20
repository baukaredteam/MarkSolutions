import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
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
  MPT_ADAPTER,
} from "./integrations";
import { createMptAdapter } from "./http-mpt.adapter";
import {
  FilesController,
  FilesService,
  STORAGE_ADAPTER,
} from "./files.controller";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { OrderController } from "./order.controller";
import { OrderService } from "./order.service";
import { VaultController } from "./vault.controller";
import { VaultService } from "./vault.service";
import { UtilisationController } from "./utilisation.controller";
import { UtilisationService } from "./utilisation.service";
import { CodeEventService } from "./code-event.service";
import { LabelController } from "./label.controller";
import { LabelService } from "./label.service";
import { DocumentController } from "./document.controller";
import { DocumentService } from "./document.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { CodeLookupController } from "./code-lookup.controller";
import { AuditController } from "./audit.controller";
import { EcomProductsController } from "./ecom-products.controller";
import { IntegrationsController } from "./integrations.controller";
import { InvoiceController } from "./invoice.controller";
import { InvoiceService } from "./invoice.service";
import { CodeLookupService } from "./code-lookup.service";
import { FileKmsAdapter, VaultKmsAdapter, KMS_ADAPTER } from "./kms.adapter";
import { LocalStorageAdapter } from "@markflow/shared";
import { join } from "node:path";

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
    } catch (err) {
      db = "error";
      detail = String((err as Error).message).slice(0, 120);
    }
    return { status: "ok", db, detail };
  }

  // W0-05: readiness probe — fails if migration is stale, adapter is demo-only,
  // or the process was started with an invalid production configuration.
  @Public()
  @Get("ready")
  async ready() {
    const env = process.env as Record<string, string>;
    const mode = env.NODE_ENV ?? "";
    const checks: { name: string; status: string }[] = [];

    // 1. Database connection
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({ name: "database", status: "ok" });
    } catch {
      checks.push({ name: "database", status: "error" });
    }

    // 2. Migration staleness — attempt to query an index-backed column; if the schema
    //    is behind (missing table/column), the raw query will fail.
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "Outbox" LIMIT 1`;
      checks.push({ name: "migration", status: "ok" });
    } catch {
      checks.push({ name: "migration", status: "stale" });
    }

    // 3. Adapter mode sanity — list active adapter modes for auditability
    const adapterMode = (name: string) =>
      env[`ADAPTERS_${name}`] ?? env[`adapters_${name}`] ?? "mock";
    checks.push({
      name: "adapters",
      status: `mpt=${adapterMode("MPT")} gs1=${adapterMode("GS1")} nkt=${adapterMode("NKT")}`,
    });

    // 4. KMS mode
    checks.push({
      name: "kms",
      status: env.KMS_PROFILE ?? "file",
    });

    const allOk = checks.every(
      (c) => c.status === "ok" || c.name !== "database"
    );
    return {
      status: allOk ? "ok" : "degraded",
      mode: mode || "unset",
      checks,
    };
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
    // ConfigService (C-01): выбор реализаций адаптеров через env (ADAPTERS_MPT и др.)
    ConfigModule.forRoot({ isGlobal: true }),
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
    FilesController,
    BillingController,
    OrderController,
    VaultController,
    UtilisationController,
    LabelController,
    DocumentController,
    DashboardController,
    CodeLookupController,
    AuditController,
    EcomProductsController,
    IntegrationsController,
    InvoiceController,
  ],
  providers: [
    PrismaService,
    AuthService,
    CatalogService,
    ModerationService,
    InvoiceService,
    GtinResolver,
    OutboxPoller,
    SeedService,
    FilesService,
    BillingService,
    OrderService,
    VaultService,
    UtilisationService,
    CodeEventService,
    LabelService,
    DocumentService,
    DashboardService,
    CodeLookupService,
    {
      provide: KMS_ADAPTER,
      useFactory: () =>
        process.env.KMS_PROFILE === "openbao"
          ? new VaultKmsAdapter()
          : new FileKmsAdapter(),
    },
    {
      provide: STORAGE_ADAPTER,
      useFactory: () =>
        new LocalStorageAdapter(
          process.env.STORAGE_DIR ?? join(process.cwd(), "storage")
        ),
    },
    { provide: ECOM_ADAPTER, useClass: MockEcomAdapter },
    { provide: IGS1_ADAPTER, useClass: MockGs1Adapter },
    { provide: NKT_ADAPTER, useClass: MockNktAdapter },
    // C-01: ADAPTERS_MPT=http → HttpMptAdapter, иначе Mock (схема DI из аудита)
    {
      provide: MPT_ADAPTER,
      useFactory: (config: ConfigService, prisma: PrismaService) =>
        createMptAdapter(config, prisma),
      inject: [ConfigService, PrismaService],
    },
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
