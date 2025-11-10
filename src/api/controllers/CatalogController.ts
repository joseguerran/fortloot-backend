import { Request, Response } from 'express';
import { prisma } from '../../database/client';
import { PricingService } from '../../services/PricingService';
import { FortniteAPIService } from '../../services/FortniteAPIService';
import { log } from '../../utils/logger';
import { CatalogFreshnessChecker } from '../../utils/catalogFreshness';
import {
  CatalogItemRequest,
  FlashSaleRequest,
} from '../../types';
import { ProductType } from '@prisma/client';
import { botManager } from '../../bots/BotManager';

export class CatalogController {
  // Mutex to prevent concurrent sync operations
  private static syncInProgress = false;

  /**
   * Sync catalog logic (can be called directly without HTTP context)
   * Returns sync result data
   */
  static async syncCatalogFromAPI() {
    log.info('Starting catalog update from Fortnite API...');

    // Fetch items from Fortnite API
    const apiItems = await FortniteAPIService.fetchItemShop();

    if (apiItems.length === 0) {
      log.warn('No items fetched from Fortnite API. Using existing active items as fallback.');

      // FALLBACK: If API fails, link existing active items to today's catalog
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const shopClosesAt = FortniteAPIService.getShopRotationTime();

      // Get or create today's catalog
      let catalog = await prisma.dailyCatalog.findUnique({
        where: { date: today },
      });

      if (!catalog) {
        catalog = await prisma.dailyCatalog.create({
          data: {
            date: today,
            shopClosesAt,
          },
        });
        log.info(`Created new catalog for ${today.toISOString()}`);
      }

      // Get all active items (both API and custom)
      const activeItems = await prisma.catalogItem.findMany({
        where: { isActive: true },
      });

      // Link all active items to today's catalog
      let linked = 0;
      for (const item of activeItems) {
        await prisma.dailyCatalogItem.upsert({
          where: {
            catalogId_itemId: {
              catalogId: catalog.id,
              itemId: item.id,
            },
          },
          create: {
            catalogId: catalog.id,
            itemId: item.id,
          },
          update: {},
        });
        linked++;
      }

      log.info(`Fallback: Linked ${linked} existing active items to today's catalog`);

      return {
        success: true,
        catalogId: catalog.id,
        itemCount: linked,
        apiItems: 0,
        customItems: activeItems.filter(i => i.isCustom).length,
        message: 'Using existing active items (API returned no items)',
        fallback: true,
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get shop rotation time from Fortnite API
    const shopClosesAt = FortniteAPIService.getShopRotationTime();

    // Get or create today's catalog
    let catalog = await prisma.dailyCatalog.findUnique({
      where: { date: today },
    });

    if (!catalog) {
      catalog = await prisma.dailyCatalog.create({
        data: {
          date: today,
          shopClosesAt,
        },
      });
      log.info(`Created new catalog for ${today.toISOString()}`);
    } else {
      // Update shop closes at time
      catalog = await prisma.dailyCatalog.update({
        where: { id: catalog.id },
        data: { shopClosesAt },
      });
    }

    let newItems = 0;
    let updatedItems = 0;
    let deactivatedItems = 0;

    // Track item IDs from API
    const apiItemIds = new Set(apiItems.map(item => item.itemId));

    // Process each API item
    for (const apiItem of apiItems) {
      // Check if item already exists
      const existing = await prisma.catalogItem.findFirst({
        where: {
          itemId: apiItem.itemId,
          isCustom: false,
        },
      });

      if (existing) {
        // Update existing item
        await prisma.catalogItem.update({
          where: { id: existing.id },
          data: {
            offerId: apiItem.offerId,
            name: apiItem.name,
            description: apiItem.description,
            type: apiItem.type,
            rarity: apiItem.rarity,
            image: apiItem.image,
            baseVbucks: apiItem.baseVbucks,
            inDate: new Date(apiItem.inDate),
            outDate: new Date(apiItem.outDate),
            isActive: true, // Reactivate if it was inactive
          },
        });

        // Associate with today's catalog
        await prisma.dailyCatalogItem.upsert({
          where: {
            catalogId_itemId: {
              catalogId: catalog.id,
              itemId: existing.id,
            },
          },
          create: {
            catalogId: catalog.id,
            itemId: existing.id,
          },
          update: {},
        });

        updatedItems++;
      } else {
        // Create new item
        const newItem = await prisma.catalogItem.create({
          data: {
            itemId: apiItem.itemId,
            offerId: apiItem.offerId,
            name: apiItem.name,
            description: apiItem.description,
            type: apiItem.type,
            rarity: apiItem.rarity,
            image: apiItem.image,
            baseVbucks: apiItem.baseVbucks,
            inDate: new Date(apiItem.inDate),
            outDate: new Date(apiItem.outDate),
            isCustom: false,
            isActive: true,
          },
        });

        // Associate with today's catalog
        await prisma.dailyCatalogItem.create({
          data: {
            catalogId: catalog.id,
            itemId: newItem.id,
          },
        });

        newItems++;
      }
    }

    // Deactivate API items that are no longer in shop
    const previousApiItems = await prisma.catalogItem.findMany({
      where: {
        isCustom: false,
        isActive: true,
      },
    });

    for (const item of previousApiItems) {
      if (item.itemId && !apiItemIds.has(item.itemId)) {
        await prisma.catalogItem.update({
          where: { id: item.id },
          data: { isActive: false },
        });
        deactivatedItems++;
      }
    }

    // Also add custom items to catalog
    const customItems = await prisma.catalogItem.findMany({
      where: {
        isCustom: true,
        isActive: true,
      },
    });

    for (const customItem of customItems) {
      await prisma.dailyCatalogItem.upsert({
        where: {
          catalogId_itemId: {
            catalogId: catalog.id,
            itemId: customItem.id,
          },
        },
        create: {
          catalogId: catalog.id,
          itemId: customItem.id,
        },
        update: {},
      });
    }

    const totalItems = newItems + updatedItems + customItems.length;

    log.info(
      `Catalog updated: ${newItems} new, ${updatedItems} updated, ${deactivatedItems} deactivated, ${customItems.length} custom items`
    );

    return {
      success: true,
      catalogId: catalog.id,
      shopClosesAt,
      itemCount: totalItems,
      apiItems: newItems + updatedItems,
      customItems: customItems.length,
      newItems,
      updatedItems,
      deactivatedItems,
    };
  }

  /**
   * Get current daily catalog with calculated prices
   */
  static async getCurrentCatalog(req: Request, res: Response) {
    const customerEpicId = req.query.customerEpicId as string | undefined;

    // AUTO-SYNC FALLBACK: Check if catalog is stale
    const { isStale, reason } = await CatalogFreshnessChecker.isCatalogStale();

    if (isStale && !this.syncInProgress) {
      log.warn(`Catalog is stale (${reason}). Auto-triggering sync...`);

      // Set mutex to prevent concurrent syncs
      this.syncInProgress = true;

      try {
        // Trigger background sync (don't await to not block the request)
        this.performAutoSync().catch(error => {
          log.error('Auto-sync failed:', error);
        });

        // Wait a moment for sync to populate data
        await new Promise(resolve => setTimeout(resolve, 2000));
      } finally {
        this.syncInProgress = false;
      }
    }

    // Get today's catalog
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let catalog = await prisma.dailyCatalog.findUnique({
      where: { date: today },
      include: {
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    // If no catalog for today, create one (will be populated by CRON or manual update)
    if (!catalog) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      catalog = await prisma.dailyCatalog.create({
        data: {
          date: today,
          shopClosesAt: tomorrow,
        },
        include: {
          items: {
            include: {
              item: true,
            },
          },
        },
      });

      log.info('Created empty daily catalog for today');
    }

    // Get customer if provided
    let customer = null;
    if (customerEpicId) {
      customer = await prisma.customer.findUnique({
        where: { epicAccountId: customerEpicId },
      });
    }

    // Calculate prices for all items
    const catalogItems = catalog.items.map((ci) => ci.item);
    const priceMap = await PricingService.calculatePrices(catalogItems, customer);

    // Format response
    const itemsWithPrices = catalog.items.map((catalogItem) => {
      const price = priceMap.get(catalogItem.item.id);
      return {
        ...catalogItem.item,
        calculatedPrice: price,
        dayPrice: catalogItem.dayPrice,
      };
    });

    res.json({
      success: true,
      data: {
        catalog: {
          date: catalog.date,
          shopClosesAt: catalog.shopClosesAt,
        },
        items: itemsWithPrices,
      },
    });
  }

  /**
   * Update catalog from Fortnite API (admin/CRON)
   */
  static async updateCatalog(req: Request, res: Response) {
    try {
      // OPTIONAL: Verify sync auth token if provided (for GitHub Actions)
      const authHeader = req.headers.authorization;
      const syncAuthToken = process.env.SYNC_AUTH_TOKEN;

      if (syncAuthToken && authHeader) {
        const token = authHeader.replace('Bearer ', '');
        if (token !== syncAuthToken) {
          log.warn('Invalid sync auth token received');
          return res.status(401).json({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Invalid authentication token',
          });
        }
        log.info('Sync auth token verified');
      }

      // Call the sync logic
      const result = await this.syncCatalogFromAPI();

      // Return HTTP response
      const message = result.fallback
        ? 'Catalog updated using existing items (API fallback)'
        : 'Catalog updated successfully from Fortnite API';

      res.json({
        success: true,
        data: {
          ...result,
          updatedAt: new Date(),
        },
        message,
      });
    } catch (error) {
      log.error('Error updating catalog:', error);
      res.status(500).json({
        success: false,
        error: 'CATALOG_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update catalog',
      });
    }
  }

  /**
   * Internal method to perform auto-sync (called by fallback mechanism)
   */
  private static async performAutoSync(): Promise<void> {
    try {
      log.info('[AUTO-SYNC] Starting automatic catalog sync...');

      // Fetch items from Fortnite API
      const apiItems = await FortniteAPIService.fetchItemShop();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const shopClosesAt = FortniteAPIService.getShopRotationTime();

      // Get or create today's catalog
      let catalog = await prisma.dailyCatalog.findUnique({
        where: { date: today },
      });

      if (!catalog) {
        catalog = await prisma.dailyCatalog.create({
          data: {
            date: today,
            shopClosesAt,
          },
        });
        log.info(`[AUTO-SYNC] Created new catalog for ${today.toISOString()}`);
      }

      if (apiItems.length === 0) {
        // API fallback: Link existing active items
        log.warn('[AUTO-SYNC] API returned no items, using existing active items');
        const activeItems = await prisma.catalogItem.findMany({
          where: { isActive: true },
        });

        for (const item of activeItems) {
          await prisma.dailyCatalogItem.upsert({
            where: {
              catalogId_itemId: {
                catalogId: catalog.id,
                itemId: item.id,
              },
            },
            create: {
              catalogId: catalog.id,
              itemId: item.id,
            },
            update: {},
          });
        }

        log.info(`[AUTO-SYNC] Linked ${activeItems.length} existing items`);
        return;
      }

      // Process API items
      const apiItemIds = new Set(apiItems.map(item => item.itemId));

      for (const apiItem of apiItems) {
        const existing = await prisma.catalogItem.findFirst({
          where: {
            itemId: apiItem.itemId,
            isCustom: false,
          },
        });

        if (existing) {
          await prisma.catalogItem.update({
            where: { id: existing.id },
            data: {
              offerId: apiItem.offerId,
              name: apiItem.name,
              description: apiItem.description,
              type: apiItem.type,
              rarity: apiItem.rarity,
              image: apiItem.image,
              baseVbucks: apiItem.baseVbucks,
              inDate: new Date(apiItem.inDate),
              outDate: new Date(apiItem.outDate),
              isActive: true,
            },
          });

          await prisma.dailyCatalogItem.upsert({
            where: {
              catalogId_itemId: {
                catalogId: catalog.id,
                itemId: existing.id,
              },
            },
            create: {
              catalogId: catalog.id,
              itemId: existing.id,
            },
            update: {},
          });
        } else {
          const newItem = await prisma.catalogItem.create({
            data: {
              itemId: apiItem.itemId,
              offerId: apiItem.offerId,
              name: apiItem.name,
              description: apiItem.description,
              type: apiItem.type,
              rarity: apiItem.rarity,
              image: apiItem.image,
              baseVbucks: apiItem.baseVbucks,
              inDate: new Date(apiItem.inDate),
              outDate: new Date(apiItem.outDate),
              isCustom: false,
              isActive: true,
            },
          });

          await prisma.dailyCatalogItem.create({
            data: {
              catalogId: catalog.id,
              itemId: newItem.id,
            },
          });
        }
      }

      // Deactivate old API items
      const previousApiItems = await prisma.catalogItem.findMany({
        where: {
          isCustom: false,
          isActive: true,
        },
      });

      for (const item of previousApiItems) {
        if (item.itemId && !apiItemIds.has(item.itemId)) {
          await prisma.catalogItem.update({
            where: { id: item.id },
            data: { isActive: false },
          });
        }
      }

      // Add custom items
      const customItems = await prisma.catalogItem.findMany({
        where: {
          isCustom: true,
          isActive: true,
        },
      });

      for (const customItem of customItems) {
        await prisma.dailyCatalogItem.upsert({
          where: {
            catalogId_itemId: {
              catalogId: catalog.id,
              itemId: customItem.id,
            },
          },
          create: {
            catalogId: catalog.id,
            itemId: customItem.id,
          },
          update: {},
        });
      }

      log.info(`[AUTO-SYNC] Completed successfully. Items: ${apiItems.length} API + ${customItems.length} custom`);
    } catch (error) {
      log.error('[AUTO-SYNC] Failed:', error);
      throw error;
    }
  }

  /**
   * Get all catalog items (admin)
   */
  static async getItems(req: Request, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const type = req.query.type as string | undefined;
    const rarity = req.query.rarity as string | undefined;
    const isCustom = req.query.isCustom === 'true' ? true : req.query.isCustom === 'false' ? false : undefined;
    const isActive = req.query.isActive === 'false' ? false : true;
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as string || 'createdAt';
    const sortOrder = (req.query.sortOrder as string || 'desc') as 'asc' | 'desc';

    const where: any = { isActive };
    if (type) where.type = type;
    if (rarity) where.rarity = { contains: rarity, mode: 'insensitive' };
    if (isCustom !== undefined) where.isCustom = isCustom;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { itemId: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy based on sortBy parameter
    let orderBy: any = {};
    if (sortBy === 'price') {
      // Sort by baseVbucks or basePriceUsd
      orderBy = [
        { baseVbucks: sortOrder },
        { basePriceUsd: sortOrder },
      ];
    } else if (sortBy === 'name') {
      orderBy = { name: sortOrder };
    } else if (sortBy === 'type') {
      orderBy = { type: sortOrder };
    } else {
      orderBy = { createdAt: sortOrder };
    }

    const [items, total] = await Promise.all([
      prisma.catalogItem.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.catalogItem.count({ where }),
    ]);

    // Calculate prices for all items
    const priceMap = await PricingService.calculatePrices(items, null);

    // Add calculated prices to items
    const itemsWithPrices = items.map((item) => ({
      ...item,
      calculatedPrice: priceMap.get(item.id),
    }));

    res.json({
      success: true,
      data: {
        items: itemsWithPrices,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  }

  /**
   * Create custom catalog item (admin)
   */
  static async createItem(req: Request, res: Response) {
    const data = req.body as CatalogItemRequest;

    // Validate required fields
    if (!data.name || !data.description || !data.type || !data.image) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Missing required fields: name, description, type, image',
      });
    }

    // Validate pricing
    if (!data.baseVbucks && !data.basePriceUsd) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Item must have either baseVbucks or basePriceUsd',
      });
    }

    const item = await prisma.catalogItem.create({
      data: {
        itemId: data.itemId,
        name: data.name,
        description: data.description,
        type: data.type as ProductType,
        rarity: data.rarity,
        image: data.image,
        baseVbucks: data.baseVbucks,
        basePriceUsd: data.basePriceUsd,
        profitMargin: data.profitMargin,
        discount: data.discount || 0,
        isCustom: data.isCustom,
        requiresManualProcess: data.requiresManualProcess || false,
        tags: data.tags || [],
        bundleItems: data.bundleItems as any,
      },
    });

    log.info(`Custom catalog item created: ${item.name} (${item.id})`);

    // If item is active and custom, add it to today's catalog automatically
    if (item.isActive && item.isCustom) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get or create today's catalog
      let catalog = await prisma.dailyCatalog.findUnique({
        where: { date: today },
      });

      if (!catalog) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        catalog = await prisma.dailyCatalog.create({
          data: {
            date: today,
            shopClosesAt: tomorrow,
          },
        });
        log.info('Created daily catalog for today');
      }

      // Add item to today's catalog
      await prisma.dailyCatalogItem.create({
        data: {
          catalogId: catalog.id,
          itemId: item.id,
        },
      });

      log.info(`Added custom item ${item.name} to today's catalog`);
    }

    res.status(201).json({
      success: true,
      data: item,
      message: 'Catalog item created successfully',
    });
  }

  /**
   * Update catalog item (admin)
   */
  static async updateItem(req: Request, res: Response) {
    const { id } = req.params;
    const data = req.body as Partial<CatalogItemRequest>;

    const item = await prisma.catalogItem.findUnique({
      where: { id },
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'ITEM_NOT_FOUND',
        message: 'Catalog item not found',
      });
    }

    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.description) updateData.description = data.description;
    if (data.type) updateData.type = data.type;
    if (data.rarity !== undefined) updateData.rarity = data.rarity;
    if (data.image) updateData.image = data.image;
    if (data.baseVbucks !== undefined) updateData.baseVbucks = data.baseVbucks;
    if (data.basePriceUsd !== undefined) updateData.basePriceUsd = data.basePriceUsd;
    if (data.profitMargin !== undefined) updateData.profitMargin = data.profitMargin;
    if (data.discount !== undefined) updateData.discount = data.discount;
    if (data.requiresManualProcess !== undefined) updateData.requiresManualProcess = data.requiresManualProcess;
    if (data.tags) updateData.tags = data.tags;
    if (data.bundleItems) updateData.bundleItems = data.bundleItems;

    const updated = await prisma.catalogItem.update({
      where: { id },
      data: updateData,
    });

    log.info(`Catalog item updated: ${updated.name} (${updated.id})`);

    res.json({
      success: true,
      data: updated,
      message: 'Catalog item updated successfully',
    });
  }

  /**
   * Deactivate catalog item (admin)
   */
  static async deleteItem(req: Request, res: Response) {
    const { id } = req.params;

    const item = await prisma.catalogItem.update({
      where: { id },
      data: { isActive: false },
    });

    log.info(`Catalog item deactivated: ${item.name} (${item.id})`);

    res.json({
      success: true,
      message: 'Catalog item deactivated successfully',
    });
  }

  /**
   * Create flash sale (admin)
   */
  static async createFlashSale(req: Request, res: Response) {
    const { id } = req.params;
    const { flashSalePrice, durationHours } = req.body as FlashSaleRequest;

    if (!flashSalePrice || !durationHours) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'flashSalePrice and durationHours are required',
      });
    }

    const flashSaleEndsAt = new Date();
    flashSaleEndsAt.setHours(flashSaleEndsAt.getHours() + durationHours);

    const item = await prisma.catalogItem.update({
      where: { id },
      data: {
        flashSalePrice,
        flashSaleEndsAt,
      },
    });

    log.info(
      `Flash sale created for ${item.name}: $${flashSalePrice} until ${flashSaleEndsAt.toISOString()}`
    );

    res.json({
      success: true,
      data: {
        item,
        flashSaleEndsAt,
      },
      message: 'Flash sale created successfully',
    });
  }

  /**
   * Get catalog closes at time
   */
  static async getClosesAt(req: Request, res: Response) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const catalog = await prisma.dailyCatalog.findUnique({
      where: { date: today },
    });

    if (!catalog) {
      // Default to next midnight
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      return res.json({
        success: true,
        data: {
          shopClosesAt: tomorrow,
          isDefault: true,
        },
      });
    }

    res.json({
      success: true,
      data: {
        shopClosesAt: catalog.shopClosesAt,
        isDefault: false,
      },
    });
  }

  /**
   * Search Epic Games catalog for items
   * Queries catalog directly from a bot client
   */
  static async searchCatalog(req: Request, res: Response) {
    const query = req.query.q as string | undefined;
    const type = req.query.type as string | undefined;
    const giftableOnly = req.query.giftableOnly === 'true';
    const limit = parseInt(req.query.limit as string) || 10;
    const botId = req.query.botId as string | undefined;
    const strict = req.query.strict !== 'false'; // Default to true (strict mode)

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_QUERY',
        message: 'Query parameter "q" is required',
      });
    }

    try {
      // Get a bot client to query the catalog
      // If botId is provided, use that specific bot, otherwise use any active bot
      let botClient;

      if (botId) {
        botClient = botManager.getBot(botId);
        if (!botClient) {
          return res.status(404).json({
            success: false,
            error: 'BOT_NOT_FOUND',
            message: `Bot ${botId} not found or offline`,
          });
        }
      } else {
        // Get any active bot
        const activeBots = botManager.getActiveBots();
        if (activeBots.length === 0) {
          return res.status(503).json({
            success: false,
            error: 'NO_BOTS_AVAILABLE',
            message: 'No bots are currently online to query the catalog',
          });
        }
        botClient = activeBots[0];
      }

      log.info('Searching Epic Games catalog', { query, type, giftableOnly, limit, strict });

      // Search using the bot client
      const searchResult = await botClient.searchCatalogItem(query, strict);

      if (!searchResult.found) {
        return res.status(404).json({
          success: false,
          error: 'NO_RESULTS',
          message: `No items found matching "${query}"`,
          data: {
            query,
            filters: { type, giftableOnly },
          },
        });
      }

      // Combine the top match and suggestions
      const allResults = [searchResult.item!, ...(searchResult.suggestions || [])];

      // Apply filters
      let filteredResults = allResults.filter(Boolean);

      if (type) {
        filteredResults = filteredResults.filter(
          item => item.type.toLowerCase().includes(type.toLowerCase())
        );
      }

      if (giftableOnly) {
        filteredResults = filteredResults.filter(item => item.giftable);
      }

      // Limit results
      const limitedResults = filteredResults.slice(0, limit);

      if (limitedResults.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'NO_RESULTS_AFTER_FILTER',
          message: `No items found matching "${query}" with the specified filters`,
          data: {
            query,
            filters: { type, giftableOnly },
            totalBeforeFilter: allResults.length,
          },
        });
      }

      res.json({
        success: true,
        data: {
          query,
          exactMatch: searchResult.exactMatch,
          results: limitedResults,
          totalResults: filteredResults.length,
          filters: { type, giftableOnly, limit },
        },
      });

    } catch (error: any) {
      log.error('Failed to search catalog:', error);
      res.status(500).json({
        success: false,
        error: 'CATALOG_SEARCH_FAILED',
        message: error.message || 'Failed to search catalog',
      });
    }
  }

  /**
   * Debug endpoint to check catalog status
   */
  static async debugCatalog(req: Request, res: Response) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get catalog stats
      const totalItems = await prisma.catalogItem.count();
      const activeItems = await prisma.catalogItem.count({
        where: { isActive: true },
      });
      const customItems = await prisma.catalogItem.count({
        where: { isCustom: true, isActive: true },
      });

      // Get today's catalog
      const dailyCatalog = await prisma.dailyCatalog.findUnique({
        where: { date: today },
        include: {
          items: {
            include: {
              item: true,
            },
          },
        },
      });

      // Check freshness
      const freshnessCheck = await CatalogFreshnessChecker.isCatalogStale();
      const timeUntilRotation = CatalogFreshnessChecker.getTimeUntilRotation();

      // Get recent updates
      const recentUpdates = await prisma.catalogItem.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          name: true,
          type: true,
          isActive: true,
          updatedAt: true,
        },
      });

      res.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          stats: {
            totalItems,
            activeItems,
            customItems,
            apiItems: activeItems - customItems,
          },
          dailyCatalog: dailyCatalog
            ? {
                date: dailyCatalog.date,
                shopClosesAt: dailyCatalog.shopClosesAt,
                totalItems: dailyCatalog.items.length,
                activeItems: dailyCatalog.items.filter(i => i.item.isActive).length,
              }
            : null,
          freshness: {
            isStale: freshnessCheck.isStale,
            reason: freshnessCheck.reason,
            timeUntilRotation: CatalogFreshnessChecker.formatTime(timeUntilRotation),
            timeUntilRotationMs: timeUntilRotation,
          },
          recentUpdates: recentUpdates.map(item => ({
            name: item.name,
            type: item.type,
            isActive: item.isActive,
            updatedAt: item.updatedAt,
          })),
        },
      });
    } catch (error: any) {
      log.error('Failed to get debug info:', error);
      res.status(500).json({
        success: false,
        error: 'DEBUG_FAILED',
        message: error.message || 'Failed to get debug info',
      });
    }
  }
}
