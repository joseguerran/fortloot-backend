import { prisma } from '../database/client';
import { PriceBreakdown } from '../types';
import { CatalogItem, Customer, PricingConfig } from '@prisma/client';
import { log } from '../utils/logger';

export class PricingService {
  private static pricingConfigCache: PricingConfig | null = null;
  private static cacheTimestamp: number = 0;
  private static CACHE_TTL = 60000; // 1 minute

  /**
   * Get pricing configuration (with caching)
   */
  private static async getPricingConfig(): Promise<PricingConfig> {
    const now = Date.now();

    // Return cached config if still valid
    if (
      this.pricingConfigCache &&
      now - this.cacheTimestamp < this.CACHE_TTL
    ) {
      return this.pricingConfigCache;
    }

    // Get config from database
    let config = await prisma.pricingConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    // Create default config if none exists
    if (!config) {
      config = await prisma.pricingConfig.create({
        data: {
          vbucksToUsdRate: 0.005,
          usdToLocalRate: 1.0,
          defaultProfitMargin: 30,
          defaultDiscount: 0,
          taxRate: 0,
          applyTaxToFinalPrice: true,
          categoryDiscounts: null,
          tierDiscounts: null,
          currencyCode: 'USD',
          currencySymbol: '$',
        },
      });
      log.info('Created default pricing config');
    }

    // Update cache
    this.pricingConfigCache = config;
    this.cacheTimestamp = now;

    return config;
  }

  /**
   * Clear pricing config cache
   */
  static clearCache() {
    this.pricingConfigCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Calculate price for a catalog item
   */
  static async calculatePrice(
    item: CatalogItem,
    customer?: Customer | null
  ): Promise<PriceBreakdown> {
    const config = await this.getPricingConfig();

    // Step 1: Calculate base price
    let basePrice: number;

    if (item.baseVbucks !== null && item.baseVbucks !== undefined) {
      // Item priced in V-Bucks (from Fortnite API)
      basePrice = item.baseVbucks * config.vbucksToUsdRate;
    } else if (item.basePriceUsd !== null && item.basePriceUsd !== undefined) {
      // Item priced directly in USD (custom items)
      basePrice = item.basePriceUsd;
    } else {
      log.error(`Item ${item.id} has no base price (V-Bucks or USD)`);
      throw new Error('Item has no base price configured');
    }

    // Step 2: Check for flash sale (overrides everything)
    if (
      item.flashSalePrice &&
      item.flashSaleEndsAt &&
      item.flashSaleEndsAt > new Date()
    ) {
      return {
        basePrice,
        profitAmount: item.flashSalePrice - basePrice,
        discountAmount: 0,
        finalPrice: item.flashSalePrice,
        vbucksPrice: item.baseVbucks || undefined,
      };
    }

    // Step 3: Apply profit margin
    const profitMargin =
      item.profitMargin !== null && item.profitMargin !== undefined
        ? item.profitMargin
        : config.defaultProfitMargin;

    const profitAmount = basePrice * (profitMargin / 100);
    const priceWithProfit = basePrice + profitAmount;

    // Step 4: Calculate discounts
    let discountAmount = 0;

    // 4a. Discount by category
    const categoryDiscounts = config.categoryDiscounts as Record<
      string,
      number
    > | null;
    if (categoryDiscounts && categoryDiscounts[item.type]) {
      const categoryDiscount = categoryDiscounts[item.type];
      discountAmount += priceWithProfit * (categoryDiscount / 100);
    }

    // 4b. Discount specific to item
    if (item.discount > 0) {
      discountAmount += priceWithProfit * (item.discount / 100);
    }

    // 4c. Discount by customer tier
    if (customer) {
      const tierDiscounts = config.tierDiscounts as Record<
        string,
        number
      > | null;
      if (tierDiscounts && tierDiscounts[customer.tier]) {
        const tierDiscount = tierDiscounts[customer.tier];
        discountAmount += priceWithProfit * (tierDiscount / 100);
      }
    }

    // Step 5: Calculate price before tax
    let priceBeforeTax = Math.max(0, priceWithProfit - discountAmount);

    // Step 6: Apply tax if configured
    let taxAmount = 0;
    if (config.taxRate > 0 && config.applyTaxToFinalPrice) {
      taxAmount = priceBeforeTax * (config.taxRate / 100);
    }

    // Step 7: Calculate final price (with tax if applicable)
    const priceWithTax = priceBeforeTax + taxAmount;

    // Step 8: Convert to local currency
    const finalPrice = priceWithTax * config.usdToLocalRate;

    // Round to 2 decimals
    return {
      basePrice: Math.round(basePrice * 100) / 100,
      profitAmount: Math.round(profitAmount * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      finalPrice: Math.round(finalPrice * 100) / 100,
      vbucksPrice: item.baseVbucks || undefined,
      currencyCode: config.currencyCode,
      currencySymbol: config.currencySymbol,
    };
  }

  /**
   * Calculate price for multiple items
   */
  static async calculatePrices(
    items: CatalogItem[],
    customer?: Customer | null
  ): Promise<Map<string, PriceBreakdown>> {
    const priceMap = new Map<string, PriceBreakdown>();

    for (const item of items) {
      try {
        const price = await this.calculatePrice(item, customer);
        priceMap.set(item.id, price);
      } catch (error) {
        log.error(`Error calculating price for item ${item.id}:`, error);
        // Set a fallback price
        priceMap.set(item.id, {
          basePrice: item.basePriceUsd || 0,
          profitAmount: 0,
          discountAmount: 0,
          finalPrice: item.basePriceUsd || 0,
          vbucksPrice: item.baseVbucks || undefined,
        });
      }
    }

    return priceMap;
  }

  /**
   * Update pricing configuration
   */
  static async updateConfig(
    updates: Partial<PricingConfig>,
    userId?: string
  ): Promise<PricingConfig> {
    const config = await this.getPricingConfig();

    const updated = await prisma.pricingConfig.update({
      where: { id: config.id },
      data: {
        ...updates,
        updatedBy: userId,
      },
    });

    // Clear cache
    this.clearCache();

    log.info(`Pricing config updated by user ${userId}`);

    return updated;
  }

  /**
   * Get current pricing configuration
   */
  static async getConfig(): Promise<PricingConfig> {
    return this.getPricingConfig();
  }

  /**
   * Calculate order total with breakdown
   */
  static async calculateOrderTotal(
    items: Array<{ item: CatalogItem; quantity: number }>,
    customer?: Customer | null
  ): Promise<{
    items: Array<{ itemId: string; quantity: number; price: PriceBreakdown }>;
    subtotal: number;
    totalDiscount: number;
    totalProfit: number;
    total: number;
  }> {
    const itemPrices = [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalProfit = 0;

    for (const { item, quantity } of items) {
      const price = await this.calculatePrice(item, customer);
      itemPrices.push({
        itemId: item.id,
        quantity,
        price,
      });

      subtotal += price.basePrice * quantity;
      totalDiscount += price.discountAmount * quantity;
      totalProfit += price.profitAmount * quantity;
    }

    const total = itemPrices.reduce(
      (sum, { price, quantity }) => sum + price.finalPrice * quantity,
      0
    );

    return {
      items: itemPrices,
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      total: Math.round(total * 100) / 100,
    };
  }
}
