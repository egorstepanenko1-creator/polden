-- B2B corporate lunch v1: companies, contacts, leads; optional link on DeliveryOrder
CREATE TABLE "CompanyAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "defaultBranchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyAccount_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CompanyAccount_status_idx" ON "CompanyAccount"("status");
CREATE INDEX "CompanyAccount_city_idx" ON "CompanyAccount"("city");

CREATE TABLE "CompanyContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "roleTitle" TEXT,
    "preferredContactMethod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyContact_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "CompanyAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CompanyContact_companyAccountId_idx" ON "CompanyContact"("companyAccountId");

CREATE TABLE "CorporateLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyAccountId" TEXT,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "headcountEstimate" INTEGER,
    "preferredDeliveryTime" TEXT,
    "comment" TEXT,
    "sourceChannel" TEXT NOT NULL DEFAULT 'SITE',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CorporateLead_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "CompanyAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CorporateLead_status_idx" ON "CorporateLead"("status");
CREATE INDEX "CorporateLead_city_idx" ON "CorporateLead"("city");
CREATE INDEX "CorporateLead_companyAccountId_idx" ON "CorporateLead"("companyAccountId");
CREATE INDEX "CorporateLead_createdAt_idx" ON "CorporateLead"("createdAt");

ALTER TABLE "DeliveryOrder" ADD COLUMN "companyAccountId" TEXT;
CREATE INDEX "DeliveryOrder_companyAccountId_idx" ON "DeliveryOrder"("companyAccountId");
