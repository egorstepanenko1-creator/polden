-- Receipt workflow v1: накопительная приёмка по строкам черновика
ALTER TABLE "PurchaseDraft" ADD COLUMN "receiptStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "PurchaseDraft" ADD COLUMN "lastReceivedAt" DATETIME;

ALTER TABLE "PurchaseDraftLine" ADD COLUMN "receivedBaseQtyTotal" REAL NOT NULL DEFAULT 0;
