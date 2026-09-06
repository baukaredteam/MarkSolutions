import { Module } from "@nestjs/common";
import { OrderController } from "../order.controller";
import { OrderService } from "../order.service";
import { BillingModule } from "../billing/billing.module";

// ORD skeleton: Nest module boundary over existing flat controller/service.
@Module({
  imports: [BillingModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
