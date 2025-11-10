import { Request, Response } from 'express';
import { prisma } from '../../database/client';
import { PricingService } from '../../services/PricingService';
import { log } from '../../utils/logger';
import { PricingConfigUpdate } from '../../types';

export class PricingController {
  /**
   * Get pricing configuration
   */
  static async getConfig(req: Request, res: Response) {
    const config = await PricingService.getConfig();

    res.json({
      success: true,
      data: config,
    });
  }

  /**
   * Update pricing configuration (admin only)
   */
  static async updateConfig(req: Request, res: Response) {
    const updates = req.body as PricingConfigUpdate;
    const userId = (req as any).user?.id || 'system';

    // Validate updates
    if (updates.vbucksToUsdRate !== undefined && updates.vbucksToUsdRate <= 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'vbucksToUsdRate must be greater than 0',
      });
    }

    if (updates.defaultProfitMargin !== undefined && updates.defaultProfitMargin < 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'defaultProfitMargin cannot be negative',
      });
    }

    const config = await PricingService.updateConfig(updates, userId);

    log.info(`Pricing config updated by user ${userId}`, updates);

    res.json({
      success: true,
      data: config,
      message: 'Pricing configuration updated successfully',
    });
  }

  /**
   * Calculate price for a specific item
   */
  static async calculatePrice(req: Request, res: Response) {
    const { itemId, customerEpicId } = req.body;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'itemId is required',
      });
    }

    // Get catalog item
    const item = await prisma.catalogItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'ITEM_NOT_FOUND',
        message: 'Catalog item not found',
      });
    }

    // Get customer if provided
    let customer = null;
    if (customerEpicId) {
      customer = await prisma.customer.findUnique({
        where: { epicAccountId: customerEpicId },
      });
    }

    // Calculate price
    const price = await PricingService.calculatePrice(item, customer);

    res.json({
      success: true,
      data: {
        item: {
          id: item.id,
          name: item.name,
          type: item.type,
        },
        customer: customer
          ? {
              epicAccountId: customer.epicAccountId,
              tier: customer.tier,
            }
          : null,
        price,
      },
    });
  }

  /**
   * Get active discounts
   */
  static async getDiscounts(req: Request, res: Response) {
    const config = await PricingService.getConfig();

    // Get active flash sales
    const flashSales = await prisma.catalogItem.findMany({
      where: {
        isActive: true,
        flashSalePrice: { not: null },
        flashSaleEndsAt: { gt: new Date() },
      },
      select: {
        id: true,
        name: true,
        type: true,
        flashSalePrice: true,
        flashSaleEndsAt: true,
        baseVbucks: true,
        basePriceUsd: true,
      },
    });

    res.json({
      success: true,
      data: {
        categoryDiscounts: config.categoryDiscounts || {},
        tierDiscounts: config.tierDiscounts || {},
        flashSales: flashSales.map((item) => ({
          itemId: item.id,
          name: item.name,
          type: item.type,
          originalPrice: item.basePriceUsd || item.baseVbucks,
          salePrice: item.flashSalePrice,
          endsAt: item.flashSaleEndsAt,
        })),
      },
    });
  }

  /**
   * Calculate cart total
   */
  static async calculateCartTotal(req: Request, res: Response) {
    const { items, customerEpicId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'items array is required and must not be empty',
      });
    }

    // Validate items format
    for (const item of items) {
      if (!item.itemId || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Each item must have itemId and quantity > 0',
        });
      }
    }

    // Get customer if provided
    let customer = null;
    if (customerEpicId) {
      customer = await prisma.customer.findUnique({
        where: { epicAccountId: customerEpicId },
      });
    }

    // Get catalog items
    const itemIds = items.map((i: any) => i.itemId);
    const catalogItems = await prisma.catalogItem.findMany({
      where: {
        id: { in: itemIds },
        isActive: true,
      },
    });

    // Build items array with quantities
    const itemsWithQuantity = items.map((reqItem: any) => {
      const catalogItem = catalogItems.find((ci) => ci.id === reqItem.itemId);
      if (!catalogItem) {
        throw new Error(`Item ${reqItem.itemId} not found or inactive`);
      }
      return {
        item: catalogItem,
        quantity: reqItem.quantity,
      };
    });

    // Calculate total
    const result = await PricingService.calculateOrderTotal(
      itemsWithQuantity,
      customer
    );

    res.json({
      success: true,
      data: {
        customer: customer
          ? {
              epicAccountId: customer.epicAccountId,
              tier: customer.tier,
            }
          : null,
        ...result,
      },
    });
  }
}
