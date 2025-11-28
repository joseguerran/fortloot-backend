// Type definitions for Fortloot Bot System

export interface BotConfig {
  name: string;
  authorizationCode?: string;
  deviceAuth?: DeviceAuth;
  maxGiftsPerDay?: number;
  priority?: number;
}

export interface DeviceAuth {
  accountId: string;
  deviceId: string;
  secret: string;
}

export interface GiftRequest {
  orderId: string;
  recipientEpicId: string;
  recipientName: string;
  itemId: string;
  itemName: string;
  productType: string;
}

export interface FriendRequest {
  botId: string;
  epicAccountId: string;
  displayName: string;
  orderId?: string;
}

export interface BotHealth {
  botId: string;
  status: string;
  giftsAvailable: number;
  giftsToday: number;
  lastHeartbeat: Date;
  uptime: number;
  errorCount: number;
  isHealthy: boolean;
}

export interface QueueJobData {
  id: string;
  type: 'friendship' | 'gift' | 'verification';
  priority: number;
  data: unknown;
  attempts?: number;
}

export interface FriendshipJobData extends QueueJobData {
  type: 'friendship';
  data: FriendRequest;
}

export interface GiftJobData extends QueueJobData {
  type: 'gift';
  data: GiftRequest;
}

export interface OrderCreateRequest {
  customerId: string;  // Required - customer ID
  items: Array<{
    catalogItemId: string;
    name: string;
    type: string;
    quantity: number;
    priceAtPurchase: number;
  }>;
  totalAmount: number;
  subtotalAmount: number;
  discountAmount?: number;
  profitAmount?: number;
  checkoutStartedAt?: string;
  hasManualItems?: boolean;
}

export interface OrderStatusResponse {
  id: string;
  status: string;
  priority: string;
  customer?: {
    displayName: string;
    epicAccountId?: string;
    email?: string;
  };
  orderItems?: Array<{
    productName: string;
    productType: string;
  }>;
  estimatedDelivery?: Date;
  completedAt?: Date;
  failureReason?: string;
  progress: {
    current: string;
    steps: string[];
  };
}

export interface BotAvailability {
  totalBots: number;
  onlineBots: number;
  availableGifts: number;
  estimatedWaitTime: number; // hours
  nextAvailableSlot: Date;
}

export interface MetricsResponse {
  period: 'today' | 'week' | 'month';
  orders: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    successRate: number;
  };
  bots: {
    total: number;
    online: number;
    utilizationRate: number;
    avgGiftsPerBot: number;
  };
  performance: {
    avgDeliveryTime: number; // hours
    avgProcessingTime: number; // milliseconds
    uptime: number; // percentage
  };
  revenue: {
    total: number;
    avgOrderValue: number;
  };
}

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}

export interface SuccessResponse<T = unknown> {
  success: boolean;
  data: T;
  message?: string;
}

// Epic Games specific types
export interface EpicFriend {
  accountId: string;
  displayName: string;
  status: 'ACCEPTED' | 'PENDING';
  createdAt: Date;
}

export interface EpicGiftResponse {
  success: boolean;
  giftId?: string;
  error?: string;
  code?: string;
}

// Bot event types
export type BotEventType =
  | 'ready'
  | 'friend:request'
  | 'friend:added'
  | 'friend:removed'
  | 'friend:message'
  | 'party:invite'
  | 'gift:sent'
  | 'gift:failed'
  | 'error'
  | 'disconnected';

export interface BotEvent {
  type: BotEventType;
  botId: string;
  timestamp: Date;
  data: unknown;
}

// Pricing and Catalog types
export interface PriceBreakdown {
  basePrice: number;
  profitAmount: number;
  discountAmount: number;
  taxAmount?: number;
  finalPrice: number;
  vbucksPrice?: number;
  currencyCode?: string;
  currencySymbol?: string;
}

export interface CatalogItemRequest {
  itemId?: string;
  name: string;
  description: string;
  type: string;
  rarity?: string;
  image: string;
  baseVbucks?: number;
  basePriceUsd?: number;
  profitMargin?: number;
  discount?: number;
  isCustom: boolean;
  requiresManualProcess?: boolean;
  tags?: string[];
  bundleItems?: Array<{ itemId: string; quantity: number }>;
}

export interface FlashSaleRequest {
  itemId: string;
  flashSalePrice: number;
  durationHours: number;
}

export interface PricingConfigUpdate {
  vbucksToUsdRate?: number;
  usdToLocalRate?: number;
  defaultProfitMargin?: number;
  defaultDiscount?: number;
  taxRate?: number;
  applyTaxToFinalPrice?: boolean;
  categoryDiscounts?: Record<string, number>;
  tierDiscounts?: Record<string, number>;
  currencyCode?: string;
  currencySymbol?: string;
}

// Customer types
export interface CustomerSession {
  epicAccountId: string;
  contactPreference: 'EMAIL' | 'WHATSAPP';
  email?: string;       // Requerido si contactPreference es EMAIL
  phoneNumber?: string; // Requerido si contactPreference es WHATSAPP
  cartItems?: Array<{
    type: string;
  }>;
}

export interface CustomerResponse {
  id: string;
  epicAccountId: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  contactPreference: 'EMAIL' | 'WHATSAPP';
  tier: string;
  isBlacklisted: boolean;
  totalOrders: number;
  totalSpent: number;
  lifetimeValue: number;
  createdAt: Date;
}

export interface CustomerStatsResponse {
  customer: CustomerResponse;
  topProducts: Array<{
    productName: string;
    orderCount: number;
    totalSpent: number;
  }>;
  ordersByMonth: Array<{
    month: string;
    count: number;
    revenue: number;
  }>;
  friendships: Array<{
    botName: string;
    status: string;
    canGiftAt: Date;
  }>;
}

export interface BlacklistRequest {
  epicAccountId: string;
  email?: string;
  reason: string;
}

export interface TierChangeRequest {
  tier: 'REGULAR' | 'VIP' | 'PREMIUM';
}

// KPI types
export interface KPIOverview {
  today: {
    revenue: number;
    orders: number;
    profit: number;
    conversionRate: number;
  };
  thisWeek: {
    revenue: number;
    orders: number;
    profit: number;
  };
  thisMonth: {
    revenue: number;
    orders: number;
    profit: number;
  };
}

export interface ProductMetrics {
  productId: string;
  productName: string;
  productType: string;
  orderCount: number;
  revenue: number;
  profit: number;
  margin: number;
}

export interface CustomerMetrics {
  customerId: string;
  epicAccountId: string;
  email: string;
  tier: string;
  orderCount: number;
  revenue: number;
  lifetimeValue: number;
}

export interface RevenueTrend {
  date: string;
  revenue: number;
  profit: number;
  orderCount: number;
}

// Payment types
export interface PaymentVerificationRequest {
  approve: boolean;
  reason?: string;
}

export interface OrderWithPaymentRequest {
  customerId: string;  // Required - customer ID
  // Legacy fields - deprecated
  customerEpicId?: string;
  customerEmail?: string;
  productId: string;
  productName: string;
  productType: string;
  itemId: string;
  quantity?: number;
  paymentMethod: string;
  priority?: string;
}
