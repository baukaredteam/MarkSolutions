import { Module } from "@nestjs/common";
import { CatalogController } from "../catalog.controller";
import { CatalogService } from "../catalog.controller";
import { ModerationService } from "../moderation.service";
import { GtinResolver } from "../gtin-resolver";
import { MockGs1Adapter, IGS1_ADAPTER } from "../integrations";

// CAT skeleton: Nest module boundary over existing flat controller/service.
// ponytail: local ModerationService/GtinResolver copy for CatalogController DI;
// AppModule keeps its own instances for ModerationController.
@Module({
  controllers: [CatalogController],
  providers: [
    CatalogService,
    ModerationService,
    GtinResolver,
    { provide: IGS1_ADAPTER, useClass: MockGs1Adapter },
  ],
  exports: [CatalogService],
})
export class CatalogModule {}
