-- VK Bot Lead Capture v1
CREATE TABLE "VkConversationState" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "VkConversationState_peerId_key" ON "VkConversationState"("peerId");
CREATE INDEX "VkConversationState_vkUserId_idx" ON "VkConversationState"("vkUserId");

CREATE TABLE "VkLead" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "VkLead_status_idx" ON "VkLead"("status");
CREATE INDEX "VkLead_createdAt_idx" ON "VkLead"("createdAt");
CREATE INDEX "VkLead_vkUserId_idx" ON "VkLead"("vkUserId");
