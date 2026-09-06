-- Persist STAGE/xTrace orderId and MPT productGroup snapshot on Order.
ALTER TABLE "Order" ADD COLUMN "productGroup" TEXT;
ALTER TABLE "Order" ADD COLUMN "externalOrderId" TEXT;
