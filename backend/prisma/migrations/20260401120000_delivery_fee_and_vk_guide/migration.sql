-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN "itemsSubtotalKopeks" INTEGER;
ALTER TABLE "DeliveryOrder" ADD COLUMN "deliveryFeeKopeks" INTEGER;

-- Старые заказы: вся сумма была только по позициям, доставка 0
UPDATE "DeliveryOrder"
SET "itemsSubtotalKopeks" = "totalAmount", "deliveryFeeKopeks" = 0
WHERE "itemsSubtotalKopeks" IS NULL;

-- AlterTable
ALTER TABLE "VkConversationState" ADD COLUMN "draftVkGuideJson" TEXT NOT NULL DEFAULT '{}';
