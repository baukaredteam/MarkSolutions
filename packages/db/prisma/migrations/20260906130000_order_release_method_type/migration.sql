-- CONTRACT releaseMethodType snapshot on Order (PRIMARY|REMAINS|COMISSION|REMARK).
ALTER TABLE "Order" ADD COLUMN "releaseMethodType" TEXT;
