-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VkConversationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vkUserId" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "currentState" TEXT NOT NULL DEFAULT 'IDLE',
    "draftName" TEXT NOT NULL DEFAULT '',
    "draftPhone" TEXT NOT NULL DEFAULT '',
    "draftAddress" TEXT NOT NULL DEFAULT '',
    "draftRequestedDateText" TEXT NOT NULL DEFAULT '',
    "draftComment" TEXT NOT NULL DEFAULT '',
    "menuContentItemId" TEXT,
    "draftBranchId" TEXT,
    "draftDeliveryDate" TEXT,
    "draftCartJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_VkConversationState" ("createdAt", "currentState", "draftAddress", "draftComment", "draftName", "draftPhone", "draftRequestedDateText", "id", "menuContentItemId", "peerId", "updatedAt", "vkUserId") SELECT "createdAt", "currentState", "draftAddress", "draftComment", "draftName", "draftPhone", "draftRequestedDateText", "id", "menuContentItemId", "peerId", "updatedAt", "vkUserId" FROM "VkConversationState";
DROP TABLE "VkConversationState";
ALTER TABLE "new_VkConversationState" RENAME TO "VkConversationState";
CREATE UNIQUE INDEX "VkConversationState_peerId_key" ON "VkConversationState"("peerId");
CREATE INDEX "VkConversationState_vkUserId_idx" ON "VkConversationState"("vkUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
