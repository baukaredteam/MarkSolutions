import { Controller, Get, Module, Res, HttpCode, Inject } from "@nestjs/common";
import { APP_GUARD, APP_FILTER } from "@nestjs/core";
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
  MockMptAdapter,
  IGS1_ADAPTER,
  NKT_ADAPTER,
  MPT_ADAPTER,
} from "./integrations";
import { HttpMptAdapter } from "./http-mpt.adapter";
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
import { FileKmsAdapter, KMS_ADAPTER, IKmsAdapter } from "./kms.adapter";
import { OpenBaoTransitKmsAdapter } from "./openbao-kms.adapter";
import { MinioStorageAdapter } from "./minio-storage.adapter";
import { LocalStorageAdapter, StorageAdapter } from "@markflow/shared";
import { sanitizeHealthError } from "./config-validation";
import { APP_CONFIG, AppConfig } from "./config-validation";
import { AppConfigModule } from "./app-config.module";
import { ActiveScopeResolver } from "./active-scope.resolver";
import {
  MPT_WRITE_POLICY,
  createMptWritePolicy,
  MptWritePolicy,
} from "./mpt-write-policy";
import { join } from "node:path";

// W0-03a: single typed APP_CONFIG is the only configuration source for the
// JWT, MPT, KMS, storage and readiness factories. It is produced once by
// buildAppConfig() (which validates the profile) and injected everywhere; the
// factories below never read process.env / ConfigService for selection.

async function adapterHealth(
  adapter: unknown
): Promise<{ status: string; message?: string }> {
  const health = (adapter as { healthCheck?: () => Promise<boolean> })
    .healthCheck;
  if (typeof health !== "function") return { status: "ok" };
  try {
    const ok = await health.call(adapter);
    return ok ? { status: "ok" } : { status: "error", message: "unreachable" };
  } catch (e) {
    return {
      status: "error",
      message: sanitizeHealthError(String((e as Error).message)),
    };
  }
}

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(KMS_ADAPTER) private readonly kms: IKmsAdapter,
    @Inject(STORAGE_ADAPTER) private readonly storage: StorageAdapter
  ) {}

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

    const kms = await adapterHealth(this.kms);
    checks.push({ name: "kms", ...kms });
    const storage = await adapterHealth(this.storage);
    checks.push({ name: "storage", ...storage });

    const failed = checks.some(
      (c) => c.status === "error" || c.status === "stale"
    );
    res.status(failed ? 503 : 200).json({
      status: failed ? "not ready" : "ready",
      profile: this.config.profile,
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
    AppConfigModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (cfg: AppConfig) => ({
        secret: cfg.jwt.secret,
        signOptions: { expiresIn: cfg.jwt.expiresIn as unknown as number },
      }),
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
    ActiveScopeResolver,
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
      useFactory: (cfg: AppConfig): IKmsAdapter =>
        cfg.kms.profile === "openbao"
          ? new OpenBaoTransitKmsAdapter(cfg.kms.openbao)
          : new FileKmsAdapter(cfg.kms.fileDir),
      inject: [APP_CONFIG],
    },
    {
      provide: STORAGE_ADAPTER,
      useFactory: (cfg: AppConfig): StorageAdapter =>
        cfg.storage.backend === "minio"
          ? new MinioStorageAdapter(cfg.storage.minio)
          : new LocalStorageAdapter(
              cfg.storage.localDir || join(process.cwd(), "storage")
            ),
      inject: [APP_CONFIG],
    },
    {
      provide: MPT_WRITE_POLICY,
      useFactory: (cfg: AppConfig): MptWritePolicy =>
        createMptWritePolicy({ mptWriteEnabled: cfg.mpt.writeEnabled }),
      inject: [APP_CONFIG],
    },
    { provide: ECOM_ADAPTER, useClass: MockEcomAdapter },
    { provide: IGS1_ADAPTER, useClass: MockGs1Adapter },
    { provide: NKT_ADAPTER, useClass: MockNktAdapter },
    {
      provide: MPT_ADAPTER,
      useFactory: (
        cfg: AppConfig,
        prisma: PrismaService,
        policy: MptWritePolicy
      ) =>
        cfg.adapters.mpt === "http"
          ? new HttpMptAdapter(cfg, prisma, policy)
          : new MockMptAdapter(prisma),
      inject: [APP_CONFIG, PrismaService, MPT_WRITE_POLICY],
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
