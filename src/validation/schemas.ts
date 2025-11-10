import { z } from 'zod';
import { ProductType, CustomerTier, OrderStatus } from '@prisma/client';

/**
 * Customer Schemas
 */
export const createCustomerSessionSchema = z.object({
  body: z.object({
    epicAccountId: z.string()
      .min(1, 'Epic Account ID is required')
      .max(100, 'Epic Account ID too long'),
    email: z.string()
      .email('Invalid email format')
      .max(255, 'Email too long'),
  }),
});

export const verifyFriendshipSchema = z.object({
  query: z.object({
    epicAccountId: z.string()
      .min(1, 'Epic Account ID is required'),
  }),
});

export const changeTierSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),
  body: z.object({
    tier: z.nativeEnum(CustomerTier, {
      errorMap: () => ({ message: 'Invalid tier. Must be REGULAR, VIP, or PREMIUM' }),
    }),
  }),
});

export const blacklistCustomerSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),
  body: z.object({
    reason: z.string()
      .min(1, 'Blacklist reason is required')
      .max(500, 'Reason too long'),
  }),
});

export const removeFromBlacklistSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid customer ID'),
  }),
});

/**
 * Catalog Schemas
 */
export const getCurrentCatalogSchema = z.object({
  query: z.object({
    customerEpicId: z.string().optional(),
  }),
});

export const createCatalogItemSchema = z.object({
  body: z.object({
    itemId: z.string().optional(),
    name: z.string()
      .min(1, 'Name is required')
      .max(200, 'Name too long'),
    description: z.string()
      .max(1000, 'Description too long')
      .optional(),
    type: z.nativeEnum(ProductType, {
      errorMap: () => ({ message: 'Invalid product type' }),
    }),
    rarity: z.string()
      .max(50, 'Rarity too long')
      .optional(),
    image: z.string()
      .url('Invalid image URL')
      .max(500, 'Image URL too long'),
    baseVbucks: z.number()
      .int('Base V-Bucks must be an integer')
      .positive('Base V-Bucks must be positive')
      .optional(),
    basePriceUsd: z.number()
      .positive('Base price must be positive')
      .optional(),
    profitMargin: z.number()
      .min(0, 'Profit margin cannot be negative')
      .max(1000, 'Profit margin too high')
      .optional(),
    discount: z.number()
      .min(0, 'Discount cannot be negative')
      .max(100, 'Discount cannot exceed 100%')
      .optional(),
    isCustom: z.boolean().optional(),
    requiresManualProcess: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    bundleItems: z.array(z.any()).optional(),
  }).refine(
    (data) => data.baseVbucks !== undefined || data.basePriceUsd !== undefined,
    { message: 'Either baseVbucks or basePriceUsd must be provided' }
  ),
});

export const updateCatalogItemSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid item ID'),
  }),
  body: z.object({
    itemId: z.string().optional(),
    name: z.string()
      .min(1, 'Name is required')
      .max(200, 'Name too long')
      .optional(),
    description: z.string()
      .max(1000, 'Description too long')
      .optional(),
    type: z.nativeEnum(ProductType).optional(),
    rarity: z.string()
      .max(50, 'Rarity too long')
      .optional(),
    image: z.string()
      .url('Invalid image URL')
      .max(500, 'Image URL too long')
      .optional(),
    baseVbucks: z.number()
      .int('Base V-Bucks must be an integer')
      .positive('Base V-Bucks must be positive')
      .optional(),
    basePriceUsd: z.number()
      .positive('Base price must be positive')
      .optional(),
    profitMargin: z.number()
      .min(0, 'Profit margin cannot be negative')
      .max(1000, 'Profit margin too high')
      .optional(),
    discount: z.number()
      .min(0, 'Discount cannot be negative')
      .max(100, 'Discount cannot exceed 100%')
      .optional(),
    requiresManualProcess: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    bundleItems: z.array(z.any()).optional(),
  }),
});

export const deleteCatalogItemSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid item ID'),
  }),
});

export const createFlashSaleSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid item ID'),
  }),
  body: z.object({
    flashSalePrice: z.number()
      .positive('Flash sale price must be positive'),
    durationHours: z.number()
      .int('Duration must be an integer')
      .positive('Duration must be positive')
      .max(168, 'Duration cannot exceed 1 week'),
  }),
});

export const getItemsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    type: z.nativeEnum(ProductType).optional(),
    isCustom: z.enum(['true', 'false']).optional(),
    isActive: z.enum(['true', 'false']).optional(),
    search: z.string().max(200).optional(),
  }),
});

/**
 * Pricing Schemas
 */
export const updatePricingConfigSchema = z.object({
  body: z.object({
    vbucksToUsdRate: z.number()
      .positive('V-Bucks rate must be positive')
      .max(1, 'V-Bucks rate too high')
      .optional(),
    usdToLocalRate: z.number()
      .positive('USD to local rate must be positive')
      .optional(),
    defaultProfitMargin: z.number()
      .min(0, 'Profit margin cannot be negative')
      .max(1000, 'Profit margin too high')
      .optional(),
    defaultDiscount: z.number()
      .min(0, 'Discount cannot be negative')
      .max(100, 'Discount cannot exceed 100%')
      .optional(),
    taxRate: z.number()
      .min(0, 'Tax rate cannot be negative')
      .max(100, 'Tax rate cannot exceed 100%')
      .optional(),
    applyTaxToFinalPrice: z.boolean().optional(),
    categoryDiscounts: z.record(z.string(), z.number()).nullable().optional(),
    tierDiscounts: z.record(z.string(), z.number()).nullable().optional(),
    currencyCode: z.string().min(3).max(3).optional(),
    currencySymbol: z.string().max(5).optional(),
  }),
});

export const calculatePriceSchema = z.object({
  query: z.object({
    itemId: z.string().uuid('Invalid item ID'),
    customerEpicId: z.string().optional(),
  }),
});

export const calculateCartTotalSchema = z.object({
  body: z.object({
    items: z.array(z.object({
      itemId: z.string().uuid('Invalid item ID'),
      quantity: z.number()
        .int('Quantity must be an integer')
        .positive('Quantity must be positive')
        .max(100, 'Quantity too high'),
    })).min(1, 'Cart must have at least one item'),
    customerEpicId: z.string().optional(),
  }),
});

/**
 * Order Schemas
 */
export const createOrderSchema = z.object({
  body: z.object({
    customerId: z.string().uuid('Invalid customer ID'),
    items: z.array(z.object({
      catalogItemId: z.string().min(1, 'Catalog item ID is required'), // Allow any string ID, not just UUIDs
      quantity: z.number()
        .int('Quantity must be an integer')
        .positive('Quantity must be positive')
        .max(100, 'Quantity too high'),
      priceAtPurchase: z.number()
        .positive('Price must be positive'),
    })).min(1, 'Order must have at least one item'),
    totalAmount: z.number()
      .positive('Total amount must be positive'),
    subtotalAmount: z.number()
      .positive('Subtotal must be positive'),
    discountAmount: z.number()
      .min(0, 'Discount cannot be negative'),
    profitAmount: z.number()
      .min(0, 'Profit cannot be negative'),
  }),
});

export const getOrderStatusSchema = z.object({
  params: z.object({
    orderId: z.string().uuid('Invalid order ID'),
  }),
});

export const getOrdersSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
    status: z.nativeEnum(OrderStatus).optional(),
  }),
});

export const cancelOrderSchema = z.object({
  params: z.object({
    orderId: z.string().uuid('Invalid order ID'),
  }),
});

/**
 * Payment Schemas
 */
export const uploadProofSchema = z.object({
  params: z.object({
    orderId: z.string().uuid('Invalid order ID'),
  }),
  body: z.object({
    paymentMethod: z.string()
      .min(1, 'Payment method is required')
      .max(100, 'Payment method too long'),
    transactionId: z.string()
      .max(200, 'Transaction ID too long')
      .optional(),
    notes: z.string()
      .max(1000, 'Notes too long')
      .optional(),
  }),
});

export const getPendingVerificationsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/).optional(),
    limit: z.string().regex(/^\d+$/).optional(),
  }),
});

export const verifyPaymentSchema = z.object({
  params: z.object({
    orderId: z.string().uuid('Invalid order ID'),
  }),
  body: z.object({
    approved: z.boolean(),
    rejectionReason: z.string()
      .max(500, 'Rejection reason too long')
      .optional(),
  }).refine(
    (data) => data.approved === true || (data.approved === false && data.rejectionReason),
    { message: 'Rejection reason is required when rejecting payment' }
  ),
});

export const getPaymentHistorySchema = z.object({
  params: z.object({
    orderId: z.string().uuid('Invalid order ID'),
  }),
});

export const getPaymentStatsSchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export const retryPaymentSchema = z.object({
  params: z.object({
    orderId: z.string().uuid('Invalid order ID'),
  }),
});

/**
 * KPI Schemas
 */
export const getKPIsSchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export const getTopCustomersSchema = z.object({
  query: z.object({
    limit: z.string().regex(/^\d+$/).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export const getTopProductsSchema = z.object({
  query: z.object({
    limit: z.string().regex(/^\d+$/).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export const getDailyTrendSchema = z.object({
  query: z.object({
    days: z.string().regex(/^\d+$/).optional(),
  }),
});
