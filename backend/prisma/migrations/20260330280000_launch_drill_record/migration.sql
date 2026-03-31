-- Real launch drill & deploy proof v1 (manual audit records)
CREATE TABLE "LaunchDrillRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentItemId" TEXT NOT NULL,
    "expectedGeneratedUrl" TEXT NOT NULL,
    "originStatusAtRun" TEXT NOT NULL,
    "runStatus" TEXT NOT NULL DEFAULT 'STARTED',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "observedOrderId" TEXT,
    "observedRevenueKopeks" INTEGER,
    "observedAttributionSummary" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LaunchDrillRecord_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "LaunchDrillRecord_contentItemId_idx" ON "LaunchDrillRecord"("contentItemId");
CREATE INDEX "LaunchDrillRecord_startedAt_idx" ON "LaunchDrillRecord"("startedAt");
