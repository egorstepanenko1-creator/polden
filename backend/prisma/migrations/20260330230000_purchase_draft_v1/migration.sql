-- Purchase Draft v1 — сохранённый снимок потребности в закупке + офферы на момент генерации
CREATE TABLE "PurchaseDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "sourceEvaluatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseDraft_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PurchaseDraftLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purchaseDraftId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "purchaseNeedQty" REAL NOT NULL,
    "supplierId" TEXT,
    "supplierOfferId" TEXT,
    "packQuantity" REAL,
    "pricePerPackKopeks" INTEGER,
    "estimatedPacksNeeded" INTEGER,
    "estimatedBuyCostKopeks" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseDraftLine_purchaseDraftId_fkey" FOREIGN KEY ("purchaseDraftId") REFERENCES "PurchaseDraft" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseDraftLine_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseDraftLine_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseDraftLine_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PurchaseDraft_branchId_date_idx" ON "PurchaseDraft"("branchId", "date");
CREATE INDEX "PurchaseDraftLine_purchaseDraftId_idx" ON "PurchaseDraftLine"("purchaseDraftId");
