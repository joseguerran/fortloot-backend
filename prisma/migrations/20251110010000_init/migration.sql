-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('ONLINE', 'OFFLINE', 'BUSY', 'ERROR', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "CustomerTier" AS ENUM ('REGULAR', 'VIP', 'PREMIUM');

-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'WAIT_PERIOD', 'READY', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'WAITING_FRIENDSHIP', 'WAITING_PERIOD', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PENDING_PAYMENT', 'PAYMENT_UPLOADED', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED', 'EXPIRED', 'ABANDONED', 'WAITING_VBUCKS', 'WAITING_BOT_FIX', 'WAITING_BOT');

-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'VIP');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('VBUCKS', 'SKIN', 'EMOTE', 'PICKAXE', 'GLIDER', 'BACKPACK', 'WRAP', 'BATTLE_PASS', 'BUNDLE', 'OTHER');

-- CreateEnum
CREATE TYPE "GiftStatus" AS ENUM ('PENDING', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('BOT_CREATE', 'BOT_UPDATE', 'BOT_DELETE', 'BOT_LOGIN', 'BOT_LOGOUT', 'BOT_RESTART', 'BOT_CREDENTIALS_UPDATE', 'BOT_SEND_GIFT', 'ORDER_CREATE', 'ORDER_UPDATE', 'ORDER_CANCEL', 'ORDER_COMPLETE', 'USER_CREATE', 'USER_UPDATE', 'USER_DELETE', 'USER_LOGIN', 'USER_LOGOUT', 'CONFIG_UPDATE', 'CONFIG_DELETE', 'CHECKOUT_MODE_UPDATE', 'MANUAL_CHECKOUT_UPDATE', 'SYSTEM_START', 'SYSTEM_STOP', 'AUTH_FAILED', 'PERMISSION_DENIED', 'RATE_LIMIT_EXCEEDED', 'BOT_SYNC_FRIENDS', 'PAYMENT_VERIFY', 'PAYMENT_REJECT', 'CUSTOMER_CREATE', 'CUSTOMER_UPDATE', 'CUSTOMER_TIER_CHANGE', 'CUSTOMER_BLACKLIST', 'CUSTOMER_UNBLACKLIST', 'CATALOG_UPDATE', 'CATALOG_ITEM_CREATE', 'CATALOG_ITEM_UPDATE', 'CATALOG_ITEM_DELETE', 'FLASH_SALE_CREATE', 'PRICING_CONFIG_UPDATE', 'PAYMENT_METHOD_CREATE', 'PAYMENT_METHOD_UPDATE', 'PAYMENT_METHOD_DELETE', 'PAYMENT_METHOD_TOGGLE', 'PAYMENT_METHOD_REORDER');

-- CreateEnum
CREATE TYPE "BotActivityType" AS ENUM ('BOT_STARTED', 'BOT_STOPPED', 'BOT_ERROR', 'FRIEND_REQUEST_RECEIVED', 'FRIEND_ADDED', 'FRIEND_REMOVED', 'GIFT_SENT', 'GIFT_FAILED', 'MESSAGE_RECEIVED', 'MESSAGE_SENT', 'FRIENDS_SYNCED', 'VBUCKS_UPDATED');

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BotStatus" NOT NULL DEFAULT 'OFFLINE',
    "epicAccountId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "giftsToday" INTEGER NOT NULL DEFAULT 0,
    "giftsAvailable" INTEGER NOT NULL DEFAULT 5,
    "lastGiftReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "uptime" INTEGER NOT NULL DEFAULT 0,
    "maxGiftsPerDay" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vBucks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "epicAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sessionToken" TEXT,
    "tier" "CustomerTier" NOT NULL DEFAULT 'REGULAR',
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "blacklistReason" TEXT,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lifetimeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "epicAccountId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "FriendshipStatus" NOT NULL DEFAULT 'PENDING',
    "friendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canGiftAt" TIMESTAMP(3) NOT NULL,
    "requestedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "customerEpicId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "OrderPriority" NOT NULL DEFAULT 'NORMAL',
    "assignedBotId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastAttemptAt" TIMESTAMP(3),
    "estimatedDelivery" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "customerId" TEXT,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "paymentProof" TEXT,
    "paymentRejectedReason" TEXT,
    "paymentVerifiedAt" TIMESTAMP(3),
    "paymentVerifiedBy" TEXT,
    "profitAmount" DOUBLE PRECISION NOT NULL,
    "paymentNotes" TEXT,
    "paymentProofUrl" TEXT,
    "paymentUploadedAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "progressSteps" JSONB,
    "currentStep" TEXT,
    "reassignmentCount" INTEGER NOT NULL DEFAULT 0,
    "epicAccountIdConfirmed" TEXT,
    "emailConfirmed" TEXT,
    "checkoutStartedAt" TIMESTAMP(3),
    "hasManualItems" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "productName" TEXT NOT NULL,
    "productType" "ProductType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "profitAmount" DOUBLE PRECISION NOT NULL,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "recipientEpicId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "status" "GiftStatus" NOT NULL DEFAULT 'PENDING',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotMetric" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hour" INTEGER,
    "giftsAttempted" INTEGER NOT NULL DEFAULT 0,
    "giftsSuccessful" INTEGER NOT NULL DEFAULT 0,
    "giftsFailed" INTEGER NOT NULL DEFAULT 0,
    "avgProcessingTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "revenueGenerated" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analytics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ordersCreated" INTEGER NOT NULL DEFAULT 0,
    "ordersCompleted" INTEGER NOT NULL DEFAULT 0,
    "ordersFailed" INTEGER NOT NULL DEFAULT 0,
    "ordersCancelled" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDeliveryTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalBotsActive" INTEGER NOT NULL DEFAULT 0,
    "totalGiftsSent" INTEGER NOT NULL DEFAULT 0,
    "avgBotUtilization" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "description" TEXT NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotActivity" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "type" "BotActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_config" (
    "id" TEXT NOT NULL,
    "vbucksToUsdRate" DOUBLE PRECISION NOT NULL DEFAULT 0.005,
    "defaultProfitMargin" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "categoryDiscounts" JSONB,
    "tierDiscounts" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "applyTaxToFinalPrice" BOOLEAN NOT NULL DEFAULT true,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "currencySymbol" TEXT NOT NULL DEFAULT '$',
    "defaultDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usdToLocalRate" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "pricing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "itemId" TEXT,
    "offerId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "rarity" TEXT,
    "image" TEXT NOT NULL,
    "baseVbucks" INTEGER,
    "basePriceUsd" DOUBLE PRECISION,
    "profitMargin" DOUBLE PRECISION,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flashSalePrice" DOUBLE PRECISION,
    "flashSaleEndsAt" TIMESTAMP(3),
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresManualProcess" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "bundleItems" JSONB,
    "inDate" TIMESTAMP(3),
    "outDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCatalog" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shopClosesAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCatalogItem" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "dayPrice" DOUBLE PRECISION,

    CONSTRAINT "DailyCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "instructions" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountInfo" JSONB,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blacklist" (
    "id" TEXT NOT NULL,
    "epicAccountId" TEXT NOT NULL,
    "email" TEXT,
    "reason" TEXT NOT NULL,
    "blockedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMetric" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "productType" "ProductType",
    "customerId" TEXT,
    "customerEmail" TEXT,
    "customerTier" "CustomerTier",
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgOrderValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bot_name_key" ON "Bot"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_epicAccountId_key" ON "Bot"("epicAccountId");

-- CreateIndex
CREATE INDEX "Bot_status_isActive_idx" ON "Bot"("status", "isActive");

-- CreateIndex
CREATE INDEX "Bot_giftsAvailable_idx" ON "Bot"("giftsAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_epicAccountId_key" ON "Customer"("epicAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_sessionToken_key" ON "Customer"("sessionToken");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_tier_isBlacklisted_idx" ON "Customer"("tier", "isBlacklisted");

-- CreateIndex
CREATE INDEX "Friendship_status_canGiftAt_idx" ON "Friendship"("status", "canGiftAt");

-- CreateIndex
CREATE INDEX "Friendship_epicAccountId_idx" ON "Friendship"("epicAccountId");

-- CreateIndex
CREATE INDEX "Friendship_customerId_idx" ON "Friendship"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_botId_epicAccountId_key" ON "Friendship"("botId", "epicAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_status_priority_idx" ON "Order"("status", "priority");

-- CreateIndex
CREATE INDEX "Order_status_assignedBotId_idx" ON "Order"("status", "assignedBotId");

-- CreateIndex
CREATE INDEX "Order_customerEpicId_idx" ON "Order"("customerEpicId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_assignedBotId_idx" ON "Order"("assignedBotId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_catalogItemId_idx" ON "OrderItem"("catalogItemId");

-- CreateIndex
CREATE INDEX "Gift_botId_status_idx" ON "Gift"("botId", "status");

-- CreateIndex
CREATE INDEX "Gift_orderId_idx" ON "Gift"("orderId");

-- CreateIndex
CREATE INDEX "Gift_sentAt_idx" ON "Gift"("sentAt");

-- CreateIndex
CREATE INDEX "BotMetric_date_idx" ON "BotMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BotMetric_botId_date_hour_key" ON "BotMetric"("botId", "date", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "Analytics_date_key" ON "Analytics"("date");

-- CreateIndex
CREATE INDEX "Analytics_date_idx" ON "Analytics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Config_key_key" ON "Config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKey_key" ON "User"("apiKey");

-- CreateIndex
CREATE INDEX "User_apiKey_idx" ON "User"("apiKey");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "BotActivity_botId_createdAt_idx" ON "BotActivity"("botId", "createdAt");

-- CreateIndex
CREATE INDEX "BotActivity_type_createdAt_idx" ON "BotActivity"("type", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogItem_type_isActive_idx" ON "CatalogItem"("type", "isActive");

-- CreateIndex
CREATE INDEX "CatalogItem_isCustom_idx" ON "CatalogItem"("isCustom");

-- CreateIndex
CREATE INDEX "CatalogItem_itemId_idx" ON "CatalogItem"("itemId");

-- CreateIndex
CREATE INDEX "CatalogItem_offerId_idx" ON "CatalogItem"("offerId");

-- CreateIndex
CREATE INDEX "CatalogItem_outDate_idx" ON "CatalogItem"("outDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCatalog_date_key" ON "DailyCatalog"("date");

-- CreateIndex
CREATE INDEX "DailyCatalog_date_idx" ON "DailyCatalog"("date");

-- CreateIndex
CREATE INDEX "DailyCatalogItem_catalogId_idx" ON "DailyCatalogItem"("catalogId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCatalogItem_catalogId_itemId_key" ON "DailyCatalogItem"("catalogId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_slug_key" ON "PaymentMethod"("slug");

-- CreateIndex
CREATE INDEX "PaymentMethod_isActive_displayOrder_idx" ON "PaymentMethod"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "PaymentMethod_slug_idx" ON "PaymentMethod"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Blacklist_epicAccountId_key" ON "Blacklist"("epicAccountId");

-- CreateIndex
CREATE INDEX "Blacklist_epicAccountId_idx" ON "Blacklist"("epicAccountId");

-- CreateIndex
CREATE INDEX "Blacklist_email_idx" ON "Blacklist"("email");

-- CreateIndex
CREATE INDEX "BusinessMetric_date_productType_idx" ON "BusinessMetric"("date", "productType");

-- CreateIndex
CREATE INDEX "BusinessMetric_date_customerTier_idx" ON "BusinessMetric"("date", "customerTier");

-- CreateIndex
CREATE INDEX "BusinessMetric_date_idx" ON "BusinessMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMetric_date_productId_customerId_key" ON "BusinessMetric"("date", "productId", "customerId");

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotMetric" ADD CONSTRAINT "BotMetric_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotActivity" ADD CONSTRAINT "BotActivity_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCatalogItem" ADD CONSTRAINT "DailyCatalogItem_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "DailyCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCatalogItem" ADD CONSTRAINT "DailyCatalogItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

