-- Production write-off batch v1: аудит партий списания по производству
CREATE TABLE "ProductionWriteoffBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "affectedPositionsCount" INTEGER NOT NULL,
    "createdMovementCount" INTEGER NOT NULL,
    CONSTRAINT "ProductionWriteoffBatch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProductionWriteoffBatch_branchId_date_idx" ON "ProductionWriteoffBatch"("branchId", "date");

CREATE TABLE "ProductionWriteoffLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionWriteoffBatchId" TEXT NOT NULL,
    "menuDayItemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "writeoffQty" REAL NOT NULL,
    "dishVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionWriteoffLine_productionWriteoffBatchId_fkey" FOREIGN KEY ("productionWriteoffBatchId") REFERENCES "ProductionWriteoffBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionWriteoffLine_menuDayItemId_fkey" FOREIGN KEY ("menuDayItemId") REFERENCES "MenuDayItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProductionWriteoffLine_productionWriteoffBatchId_idx" ON "ProductionWriteoffLine"("productionWriteoffBatchId");
CREATE INDEX "ProductionWriteoffLine_menuDayItemId_idx" ON "ProductionWriteoffLine"("menuDayItemId");

CREATE TABLE "ProductionWriteoffMovementLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionWriteoffBatchId" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    CONSTRAINT "ProductionWriteoffMovementLink_productionWriteoffBatchId_fkey" FOREIGN KEY ("productionWriteoffBatchId") REFERENCES "ProductionWriteoffBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionWriteoffMovementLink_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProductionWriteoffMovementLink_stockMovementId_key" ON "ProductionWriteoffMovementLink"("stockMovementId");
CREATE INDEX "ProductionWriteoffMovementLink_productionWriteoffBatchId_idx" ON "ProductionWriteoffMovementLink"("productionWriteoffBatchId");
