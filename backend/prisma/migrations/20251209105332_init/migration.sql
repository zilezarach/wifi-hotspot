-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'DATA_EXCEEDED', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerPhone" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "mikrotikId" TEXT NOT NULL,
    "tunnelKey" TEXT NOT NULL,
    "mikrotikHost" TEXT NOT NULL,
    "mikrotikUser" TEXT NOT NULL DEFAULT 'admin',
    "mikrotikPass" TEXT NOT NULL,
    "mikrotikPort" INTEGER NOT NULL DEFAULT 8728,
    "mpesaShortcode" TEXT,
    "mpesaKey" TEXT,
    "mpesaSecret" TEXT,
    "mpesaPasskey" TEXT,
    "usesOwnMpesa" BOOLEAN NOT NULL DEFAULT false,
    "brandColor" TEXT NOT NULL DEFAULT '#4F46E5',
    "logoUrl" TEXT,
    "splashMessage" TEXT DEFAULT 'Welcome! Connect to cheap and available wifi',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" TIMESTAMP(3),
    "lastHealthCheck" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "setupFee" INTEGER NOT NULL DEFAULT 5000,
    "monthlyFee" INTEGER NOT NULL DEFAULT 2500,
    "revenueShare" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "billingType" TEXT NOT NULL DEFAULT 'fixed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hours" DOUBLE PRECISION NOT NULL,
    "price" INTEGER NOT NULL,
    "dataCap" INTEGER,
    "speedLimit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "badge" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "mac" TEXT NOT NULL,
    "currentIP" TEXT,
    "cloudflareIP" TEXT,
    "ipHistory" TEXT[],
    "deviceInfo" TEXT,
    "deviceFingerprint" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dataUsedMB" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dataCapMB" INTEGER,
    "transactionId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "checkoutRequestId" TEXT,
    "merchantRequestId" TEXT,
    "mpesaReceiptNumber" TEXT,
    "transactionDate" TIMESTAMP(3),
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouterHeartbeat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mikrotikId" TEXT NOT NULL,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "totalBindings" INTEGER NOT NULL DEFAULT 0,
    "cpuLoad" DOUBLE PRECISION,
    "memoryUsed" DOUBLE PRECISION,
    "memoryTotal" DOUBLE PRECISION,
    "uptime" TEXT,
    "version" TEXT,
    "boardName" TEXT,
    "bytesIn" BIGINT,
    "bytesOut" BIGINT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouterHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_mikrotikId_key" ON "Tenant"("mikrotikId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_tunnelKey_key" ON "Tenant"("tunnelKey");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_mikrotikId_idx" ON "Tenant"("mikrotikId");

-- CreateIndex
CREATE INDEX "Tenant_isActive_lastSeen_idx" ON "Tenant"("isActive", "lastSeen");

-- CreateIndex
CREATE INDEX "Tenant_ownerPhone_idx" ON "Tenant"("ownerPhone");

-- CreateIndex
CREATE INDEX "Plan_tenantId_isActive_sortOrder_idx" ON "Plan"("tenantId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_tenantId_name_key" ON "Plan"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Session_transactionId_key" ON "Session"("transactionId");

-- CreateIndex
CREATE INDEX "Session_tenantId_status_expiresAt_idx" ON "Session"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_mac_status_idx" ON "Session"("mac", "status");

-- CreateIndex
CREATE INDEX "Session_currentIP_idx" ON "Session"("currentIP");

-- CreateIndex
CREATE INDEX "Session_transactionId_idx" ON "Session"("transactionId");

-- CreateIndex
CREATE INDEX "Session_tenantId_mac_status_idx" ON "Session"("tenantId", "mac", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_sessionId_key" ON "Transaction"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_checkoutRequestId_key" ON "Transaction"("checkoutRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_mpesaReceiptNumber_key" ON "Transaction"("mpesaReceiptNumber");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_status_createdAt_idx" ON "Transaction"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_checkoutRequestId_idx" ON "Transaction"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "Transaction_mpesaReceiptNumber_idx" ON "Transaction"("mpesaReceiptNumber");

-- CreateIndex
CREATE INDEX "Transaction_phoneNumber_idx" ON "Transaction"("phoneNumber");

-- CreateIndex
CREATE INDEX "RouterHeartbeat_tenantId_timestamp_idx" ON "RouterHeartbeat"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "RouterHeartbeat_mikrotikId_timestamp_idx" ON "RouterHeartbeat"("mikrotikId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_email_idx" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_adminUserId_createdAt_idx" ON "AuditLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouterHeartbeat" ADD CONSTRAINT "RouterHeartbeat_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
