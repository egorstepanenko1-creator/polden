-- Inventory count batch v1: аудит партий инвентаризации + строки со снимком
CREATE TABLE "InventoryCountBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciledAt" DATETIME NOT NULL,
    "note" TEXT,
    "rowCount" INTEGER NOT NULL,
    "changedLineCount" INTEGER NOT NULL,
    "adjustmentInCount" INTEGER NOT NULL,
    "adjustmentOutCount" INTEGER NOT NULL,
    CONSTRAINT "InventoryCountBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "InventoryCountBatch_branchId_reconciledAt_idx" ON "InventoryCountBatch"("branchId", "reconciledAt");

CREATE TABLE "InventoryCountLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventoryCountBatchId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "systemBalanceQty" REAL NOT NULL,
    "countedQty" REAL NOT NULL,
    "differenceQty" REAL NOT NULL,
    "movementType" TEXT,
    "adjustmentQty" REAL,
    "stockMovementId" TEXT,
    CONSTRAINT "InventoryCountLine_inventoryCountBatchId_fkey" FOREIGN KEY ("inventoryCountBatchId") REFERENCES "InventoryCountBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryCountLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryCountLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryCountLine_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryCountLine_stockMovementId_key" ON "InventoryCountLine"("stockMovementId");
CREATE INDEX "InventoryCountLine_inventoryCountBatchId_idx" ON "InventoryCountLine"("inventoryCountBatchId");
