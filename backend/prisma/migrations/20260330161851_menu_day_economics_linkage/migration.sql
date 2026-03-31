-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MenuDayItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "branchId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "dishVersionId" TEXT,
    "foodCostKopeksSnapshot" INTEGER,
    "foodCostSnapshottedAt" DATETIME,
    CONSTRAINT "MenuDayItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MenuDayItem_dishVersionId_fkey" FOREIGN KEY ("dishVersionId") REFERENCES "DishVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MenuDayItem" ("branchId", "date", "id", "name", "position", "price") SELECT "branchId", "date", "id", "name", "position", "price" FROM "MenuDayItem";
DROP TABLE "MenuDayItem";
ALTER TABLE "new_MenuDayItem" RENAME TO "MenuDayItem";
CREATE UNIQUE INDEX "MenuDayItem_branchId_date_position_key" ON "MenuDayItem"("branchId", "date", "position");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
