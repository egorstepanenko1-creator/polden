/*
  Warnings:

  - You are about to alter the column `adjustmentQty` on the `InventoryCountLine` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `countedQty` on the `InventoryCountLine` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `differenceQty` on the `InventoryCountLine` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `systemBalanceQty` on the `InventoryCountLine` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `writeoffQty` on the `ProductionWriteoffLine` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `packQuantity` on the `PurchaseDraftLine` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `purchaseNeedQty` on the `PurchaseDraftLine` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `receivedBaseQtyTotal` on the `PurchaseDraftLine` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.
  - You are about to alter the column `isActive` on the `Supplier` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Boolean`.
  - You are about to alter the column `packQuantity` on the `SupplierIngredientOffer` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Decimal`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "deliveryDate" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "address" TEXT,
    "comment" TEXT,
    "paymentType" TEXT,
    "totalAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "sourceChannel" TEXT NOT NULL DEFAULT 'SITE',
    "attributionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryOrder" ("address", "attributionJson", "branchId", "comment", "createdAt", "customerName", "customerPhone", "deliveryDate", "id", "paymentType", "totalAmount") SELECT "address", "attributionJson", "branchId", "comment", "createdAt", "customerName", "customerPhone", "deliveryDate", "id", "paymentType", "totalAmount" FROM "DeliveryOrder";
DROP TABLE "DeliveryOrder";
ALTER TABLE "new_DeliveryOrder" RENAME TO "DeliveryOrder";
CREATE TABLE "new_InventoryCountLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventoryCountBatchId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemBalanceQty" DECIMAL NOT NULL,
    "countedQty" DECIMAL NOT NULL,
    "differenceQty" DECIMAL NOT NULL,
    "movementType" TEXT,
    "adjustmentQty" DECIMAL,
    "stockMovementId" TEXT,
    CONSTRAINT "InventoryCountLine_inventoryCountBatchId_fkey" FOREIGN KEY ("inventoryCountBatchId") REFERENCES "InventoryCountBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryCountLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryCountLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryCountLine_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryCountLine" ("adjustmentQty", "countedQty", "differenceQty", "id", "ingredientId", "inventoryCountBatchId", "movementType", "stockMovementId", "systemBalanceQty", "unitId") SELECT "adjustmentQty", "countedQty", "differenceQty", "id", "ingredientId", "inventoryCountBatchId", "movementType", "stockMovementId", "systemBalanceQty", "unitId" FROM "InventoryCountLine";
DROP TABLE "InventoryCountLine";
ALTER TABLE "new_InventoryCountLine" RENAME TO "InventoryCountLine";
CREATE UNIQUE INDEX "InventoryCountLine_stockMovementId_key" ON "InventoryCountLine"("stockMovementId");
CREATE INDEX "InventoryCountLine_inventoryCountBatchId_idx" ON "InventoryCountLine"("inventoryCountBatchId");
CREATE TABLE "new_ProductionWriteoffLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionWriteoffBatchId" TEXT NOT NULL,
    "menuDayItemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "writeoffQty" DECIMAL NOT NULL,
    "dishVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionWriteoffLine_productionWriteoffBatchId_fkey" FOREIGN KEY ("productionWriteoffBatchId") REFERENCES "ProductionWriteoffBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionWriteoffLine_menuDayItemId_fkey" FOREIGN KEY ("menuDayItemId") REFERENCES "MenuDayItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductionWriteoffLine" ("createdAt", "dishVersionId", "id", "menuDayItemId", "position", "productionWriteoffBatchId", "writeoffQty") SELECT "createdAt", "dishVersionId", "id", "menuDayItemId", "position", "productionWriteoffBatchId", "writeoffQty" FROM "ProductionWriteoffLine";
DROP TABLE "ProductionWriteoffLine";
ALTER TABLE "new_ProductionWriteoffLine" RENAME TO "ProductionWriteoffLine";
CREATE INDEX "ProductionWriteoffLine_productionWriteoffBatchId_idx" ON "ProductionWriteoffLine"("productionWriteoffBatchId");
CREATE INDEX "ProductionWriteoffLine_menuDayItemId_idx" ON "ProductionWriteoffLine"("menuDayItemId");
CREATE TABLE "new_PurchaseDraftLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseDraftId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "purchaseNeedQty" DECIMAL NOT NULL,
    "supplierId" TEXT,
    "supplierOfferId" TEXT,
    "packQuantity" DECIMAL,
    "pricePerPackKopeks" INTEGER,
    "estimatedPacksNeeded" INTEGER,
    "estimatedBuyCostKopeks" INTEGER,
    "receivedBaseQtyTotal" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseDraftLine_purchaseDraftId_fkey" FOREIGN KEY ("purchaseDraftId") REFERENCES "PurchaseDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseDraftLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseDraftLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseDraftLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseDraftLine" ("createdAt", "estimatedBuyCostKopeks", "estimatedPacksNeeded", "id", "ingredientId", "packQuantity", "pricePerPackKopeks", "purchaseDraftId", "purchaseNeedQty", "receivedBaseQtyTotal", "supplierId", "supplierOfferId", "unitId") SELECT "createdAt", "estimatedBuyCostKopeks", "estimatedPacksNeeded", "id", "ingredientId", "packQuantity", "pricePerPackKopeks", "purchaseDraftId", "purchaseNeedQty", "receivedBaseQtyTotal", "supplierId", "supplierOfferId", "unitId" FROM "PurchaseDraftLine";
DROP TABLE "PurchaseDraftLine";
ALTER TABLE "new_PurchaseDraftLine" RENAME TO "PurchaseDraftLine";
CREATE INDEX "PurchaseDraftLine_purchaseDraftId_idx" ON "PurchaseDraftLine"("purchaseDraftId");
CREATE TABLE "new_Supplier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Supplier" ("createdAt", "id", "isActive", "name", "note", "updatedAt") SELECT "createdAt", "id", "isActive", "name", "note", "updatedAt" FROM "Supplier";
DROP TABLE "Supplier";
ALTER TABLE "new_Supplier" RENAME TO "Supplier";
CREATE TABLE "new_SupplierIngredientOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "supplierId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "packQuantity" DECIMAL NOT NULL,
    "pricePerPackKopeks" INTEGER NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SupplierIngredientOffer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SupplierIngredientOffer_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupplierIngredientOffer_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SupplierIngredientOffer" ("createdAt", "effectiveFrom", "effectiveTo", "id", "ingredientId", "note", "packQuantity", "pricePerPackKopeks", "supplierId", "unitId", "updatedAt") SELECT "createdAt", "effectiveFrom", "effectiveTo", "id", "ingredientId", "note", "packQuantity", "pricePerPackKopeks", "supplierId", "unitId", "updatedAt" FROM "SupplierIngredientOffer";
DROP TABLE "SupplierIngredientOffer";
ALTER TABLE "new_SupplierIngredientOffer" RENAME TO "SupplierIngredientOffer";
CREATE INDEX "SupplierIngredientOffer_supplierId_idx" ON "SupplierIngredientOffer"("supplierId");
CREATE INDEX "SupplierIngredientOffer_ingredientId_unitId_effectiveFrom_idx" ON "SupplierIngredientOffer"("ingredientId", "unitId", "effectiveFrom");
CREATE TABLE "new_VkLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'vk_bot',
    "channel" TEXT NOT NULL DEFAULT 'vk',
    "vkUserId" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "requestedDateText" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "rawPayloadJson" TEXT NOT NULL,
    "menuContentItemId" TEXT,
    "attributionCampaign" TEXT,
    "convertedOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VkLead_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "DeliveryOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VkLead" ("address", "attributionCampaign", "channel", "comment", "createdAt", "id", "menuContentItemId", "name", "peerId", "phone", "rawPayloadJson", "requestedDateText", "source", "status", "updatedAt", "vkUserId") SELECT "address", "attributionCampaign", "channel", "comment", "createdAt", "id", "menuContentItemId", "name", "peerId", "phone", "rawPayloadJson", "requestedDateText", "source", "status", "updatedAt", "vkUserId" FROM "VkLead";
DROP TABLE "VkLead";
ALTER TABLE "new_VkLead" RENAME TO "VkLead";
CREATE UNIQUE INDEX "VkLead_convertedOrderId_key" ON "VkLead"("convertedOrderId");
CREATE INDEX "VkLead_status_idx" ON "VkLead"("status");
CREATE INDEX "VkLead_createdAt_idx" ON "VkLead"("createdAt");
CREATE INDEX "VkLead_vkUserId_idx" ON "VkLead"("vkUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
