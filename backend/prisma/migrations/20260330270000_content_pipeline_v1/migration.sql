-- VK-first content pipeline v1 (internal CRM)
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'VK',
    "contentType" TEXT NOT NULL DEFAULT 'post',
    "status" TEXT NOT NULL DEFAULT 'IDEA',
    "publishDate" DATETIME,
    "captionDraft" TEXT NOT NULL DEFAULT '',
    "creativeNote" TEXT,
    "landingPath" TEXT,
    "targetUrl" TEXT,
    "utmSource" TEXT NOT NULL DEFAULT 'vk',
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "generatedUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ContentItem_status_idx" ON "ContentItem"("status");
CREATE INDEX "ContentItem_channel_idx" ON "ContentItem"("channel");
CREATE INDEX "ContentItem_publishDate_idx" ON "ContentItem"("publishDate");
