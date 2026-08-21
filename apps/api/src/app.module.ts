import { Controller, Get, Inject, Module, Res, HttpCode } from "@nestjs/common";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Response as ExpressResponse } from "express";
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
import { FileKmsAdapter, KMS_ADAPTER } from "./kms.adapter";
import { OpenBaoTransitKmsAdapter } from "./openbao-kms.adapter";
import { MinioStorageAdapter } from "./minio-storage.adapter";
import { LocalStorageAdapter } from "@markflow/shared";
import {
  sanitizeHealthError,
  buildAppConfig,
  AppConfig,
} from "./config-validation";

export const APP_CONFIG = "APP_CONFIG";

// W0-01b: Liveness = "process is alive" (always 200, never leaks internals).
// Readiness = "dependencies are reachable" (503 if any critical dep fails).
// Separated per AGENTS.md §4 and production readiness principles.

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly cfg: AppConfig
  ) {}

  // Liveness probe — always 200 if process is alive; never expose error details.
  @Public()
  @Get()
  async health() {
    let db = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "error";
    }
    return { status: db === "ok" ? "ok" : "degraded", db };
  }

  // Readiness probe — HTTP 503 if any critical dependency is unavailable.
  @Public()
  @HttpCode(200)
  @Get("ready")
  async ready(@Res() res: ExpressResponse) {
    const checks: { name: string; status: string; message?: string }[] = [];

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({ name: "database", status: "ok" });
    } catch (e) {
      checks.push({
        name: "database",
        status: "error",
        message: sanitizeHealthError(String((e as Error).message)),
      });
    }

    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "Outbox" LIMIT 1`;
      checks.push({ name: "migration", status: "ok" });
    } catch (e) {
      checks.push({
        name: "migration",
        status: "stale",
        message: sanitizeHealthError(String((e as Error).message)),
      });
    }

    checks.push({
      name: "adapters",
      status: `mpt=${this.cfg.adapters.mpt} gs1=${this.cfg.adapters.gs1} nkt=${this.cfg.adapters.nkt}`,
    });
    checks.push({ name: "kms", status: this.cfg.kms.profile });
    checks.push({ name: "storage", status: this.cfg.storage.profile });

    const failed = checks.some(
      (c) => c.status === "error" || c.status === "stale"
    );
    res.status(failed ? 503 : 200).json({
      status: failed ? "not ready" : "ready",
      mode: this.cfg.mode || "unset",
      checks,
    });
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
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET"),
        signOptions: { expiresIn: "1h" },
      }),
      inject: [ConfigService],
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
    {
      provide: APP_CONFIG,
      useFactory: () => buildAppConfig(),
    },
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
      useFactory: (cfg: AppConfig) => {
        if (cfg.kms.profile === "openbao") {
          return new OpenBaoTransitKmsAdapter({
            baseUrl: cfg.kms.openbaoAddr,
            token: cfg.kms.openbaoToken,
            mount: cfg.kms.openbaoMount,
            key: cfg.kms.openbaoKey,
            timeoutMs: cfg.kms.openbaoTimeoutMs,
          });
        }
        return new FileKmsAdapter();
      },
      inject: [APP_CONFIG],
    },
    {
      provide: STORAGE_ADAPTER,
      useFactory: (cfg: AppConfig) => {
        if (cfg.storage.profile === "local") {
          return new LocalStorageAdapter(cfg.storage.dir);
        }
        return new MinioStorageAdapter({
          endpoint: cfg.storage.minioEndpoint,
          accessKey: cfg.storage.minioAccessKey,
          secretKey: cfg.storage.minioSecretKey,
          bucket: cfg.storage.minioBucket,
          useSsl: cfg.storage.minioUseSsl,
          timeoutMs: cfg.storage.minioTimeoutMs,
          tenantPrefix: cfg.storage.minioTenantPrefix,
        });
      },
      inject: [APP_CONFIG],
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
