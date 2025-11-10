import { PricingService } from '../../services/PricingService';
import { prisma } from '../../database/client';
import { Customer, CatalogItem, CustomerTier, ProductType } from '@prisma/client';

// Mock Prisma
jest.mock('../../database/client', () => ({
  prisma: {
    pricingConfig: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

describe('PricingService', () => {
  const mockPricingConfig = {
    id: '1',
    vbucksToUsdRate: 0.005,
    defaultProfitMargin: 30,
    categoryDiscounts: {
      OUTFIT: 5,
      PICKAXE: 3,
    },
    tierDiscounts: {
      VIP: 10,
      PREMIUM: 20,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCatalogItem: CatalogItem = {
    id: 'item-1',
    itemId: 'fortnite-item-1',
    name: 'Test Outfit',
    description: 'A test outfit',
    type: ProductType.OUTFIT,
    rarity: 'Epic',
    image: 'https://example.com/image.png',
    baseVbucks: 2000,
    basePriceUsd: null,
    profitMargin: null,
    discount: 0,
    flashSalePrice: null,
    flashSaleEndsAt: null,
    isCustom: false,
    isActive: true,
    requiresManualProcess: false,
    tags: [],
    bundleItems: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCustomer: Customer = {
    id: 'customer-1',
    epicAccountId: 'EpicPlayer123',
    email: 'test@example.com',
    sessionToken: null,
    tier: CustomerTier.VIP,
    isBlacklisted: false,
    blacklistReason: null,
    totalOrders: 5,
    totalSpent: 150.0,
    lifetimeValue: 45.0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.pricingConfig.findFirst as jest.Mock).mockResolvedValue(mockPricingConfig);
  });

  describe('calculatePrice', () => {
    it('should calculate price for V-Bucks based item without customer', async () => {
      const result = await PricingService.calculatePrice(mockCatalogItem, null);

      expect(result).toMatchObject({
        basePrice: 10.0, // 2000 * 0.005
        profitAmount: 3.0, // 30% of 10
        discountAmount: 0.5, // 5% category discount on final price
        finalPrice: 12.5, // 10 + 3 - 0.5
      });
    });

    it('should apply tier discount for VIP customer', async () => {
      const result = await PricingService.calculatePrice(mockCatalogItem, mockCustomer);

      // Base: 10, Profit: 3, Category: 5%, Tier: 10%
      // Category discount: 5% of 13 = 0.65
      // Tier discount: 10% of 13 = 1.3
      // Total discount: 0.65 + 1.3 = 1.95
      expect(result.discountAmount).toBeCloseTo(1.95, 2);
      expect(result.finalPrice).toBeCloseTo(11.05, 2);
    });

    it('should override with flash sale price', async () => {
      const flashSaleItem = {
        ...mockCatalogItem,
        flashSalePrice: 8.99,
        flashSaleEndsAt: new Date(Date.now() + 60000), // 1 minute from now
      };

      const result = await PricingService.calculatePrice(flashSaleItem, null);

      expect(result.finalPrice).toBe(8.99);
      expect(result.isFlashSale).toBe(true);
    });

    it('should not apply expired flash sale', async () => {
      const expiredFlashSaleItem = {
        ...mockCatalogItem,
        flashSalePrice: 8.99,
        flashSaleEndsAt: new Date(Date.now() - 60000), // 1 minute ago
      };

      const result = await PricingService.calculatePrice(expiredFlashSaleItem, null);

      expect(result.isFlashSale).toBe(false);
      expect(result.finalPrice).not.toBe(8.99);
    });

    it('should use custom profit margin if specified', async () => {
      const customMarginItem = {
        ...mockCatalogItem,
        profitMargin: 50, // 50% instead of default 30%
      };

      const result = await PricingService.calculatePrice(customMarginItem, null);

      expect(result.profitAmount).toBe(5.0); // 50% of 10
    });

    it('should handle USD-priced items', async () => {
      const usdItem = {
        ...mockCatalogItem,
        baseVbucks: null,
        basePriceUsd: 15.0,
      };

      const result = await PricingService.calculatePrice(usdItem, null);

      expect(result.basePrice).toBe(15.0);
      expect(result.profitAmount).toBe(4.5); // 30% of 15
    });

    it('should apply item-specific discount', async () => {
      const discountedItem = {
        ...mockCatalogItem,
        discount: 15, // 15% item discount
      };

      const result = await PricingService.calculatePrice(discountedItem, null);

      // Should have both category (5%) and item (15%) discounts
      expect(result.discountAmount).toBeGreaterThan(0.5); // More than just category
    });
  });

  describe('getPricingConfig', () => {
    it('should return cached config on subsequent calls', async () => {
      await PricingService.getPricingConfig();
      await PricingService.getPricingConfig();

      // Should only call database once due to caching
      expect(prisma.pricingConfig.findFirst).toHaveBeenCalledTimes(1);
    });

    it('should create default config if none exists', async () => {
      (prisma.pricingConfig.findFirst as jest.Mock).mockResolvedValueOnce(null);
      (prisma.pricingConfig.upsert as jest.Mock).mockResolvedValueOnce(mockPricingConfig);

      const result = await PricingService.getPricingConfig();

      expect(prisma.pricingConfig.upsert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('calculatePrices (bulk)', () => {
    it('should calculate prices for multiple items', async () => {
      const items = [mockCatalogItem, { ...mockCatalogItem, id: 'item-2' }];

      const result = await PricingService.calculatePrices(items, null);

      expect(result.size).toBe(2);
      expect(result.get('item-1')).toBeDefined();
      expect(result.get('item-2')).toBeDefined();
    });

    it('should handle empty array', async () => {
      const result = await PricingService.calculatePrices([], null);

      expect(result.size).toBe(0);
    });
  });

  describe('updatePricingConfig', () => {
    it('should update config and clear cache', async () => {
      const updates = {
        vbucksToUsdRate: 0.006,
        defaultProfitMargin: 35,
      };

      (prisma.pricingConfig.upsert as jest.Mock).mockResolvedValueOnce({
        ...mockPricingConfig,
        ...updates,
      });

      await PricingService.updatePricingConfig(updates);

      // Should clear cache, so next call fetches from DB
      await PricingService.getPricingConfig();

      expect(prisma.pricingConfig.findFirst).toHaveBeenCalledTimes(2);
    });
  });
});
