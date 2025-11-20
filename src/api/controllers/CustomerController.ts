import { Request, Response } from 'express';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import {
  CustomerSession,
  CustomerResponse,
  CustomerStatsResponse,
  BlacklistRequest,
  TierChangeRequest,
} from '../../types';
import crypto from 'crypto';

export class CustomerController {
  /**
   * Create customer session
   */
  static async createSession(req: Request, res: Response) {
    const { epicAccountId, email, cartItems } = req.body as CustomerSession;

    // Check blacklist
    const blacklisted = await prisma.blacklist.findUnique({
      where: { epicAccountId },
    });

    if (blacklisted) {
      return res.status(403).json({
        success: false,
        error: 'CUSTOMER_BLACKLISTED',
        message: 'Tu cuenta ha sido bloqueada. Contacta soporte.',
      });
    }

    // Define store item types that require bot friendships
    const STORE_TYPES = ['outfit', 'emote', 'pickaxe', 'glider', 'backpack', 'wrap'];

    // Check if cart has any store items that require bot friendships
    const hasStoreItems = cartItems && cartItems.some(item =>
      STORE_TYPES.includes(item.type)
    );

    log.info(`Session creation for ${epicAccountId} - hasStoreItems: ${hasStoreItems}`);

    // Only verify bot friendships if user has store items in cart
    if (hasStoreItems) {
      // Search by displayName since users enter their Epic display name, not accountId
      const friendships = await prisma.friendship.findMany({
        where: { displayName: epicAccountId },
      });

      // Check if user has at least one ACCEPTED friendship
      const readyFriendships = friendships.filter(f => f.status === 'ACCEPTED');

      if (readyFriendships.length === 0) {
        // Get list of active bots to show to the user
        const availableBots = await prisma.bot.findMany({
          where: {
            isActive: true,
            status: 'ONLINE',
          },
          select: {
            epicAccountId: true,
            displayName: true,
          },
          take: 5, // Limit to 5 bots
        });

        return res.status(403).json({
          success: false,
          error: 'NO_BOT_FRIENDSHIP',
          message: 'No bot friendship found',
          availableBots: availableBots.map(bot => ({
            epicId: bot.epicAccountId,
            displayName: bot.displayName,
          })),
        });
      }
    }

    // Find or create customer
    let customer = await prisma.customer.findUnique({
      where: { epicAccountId },
    });

    if (!customer) {
      // Generate session token
      const sessionToken = crypto.randomBytes(32).toString('hex');

      customer = await prisma.customer.create({
        data: {
          epicAccountId,
          email,
          sessionToken,
        },
      });

      log.info(`New customer created: ${epicAccountId}`);
    } else if (customer.isBlacklisted) {
      return res.status(403).json({
        success: false,
        error: 'CUSTOMER_BLACKLISTED',
        message: 'Tu cuenta ha sido bloqueada. Contacta soporte.',
      });
    } else {
      // Update email if changed
      if (customer.email !== email) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: { email },
        });
      }
    }

    const response: CustomerResponse = {
      id: customer.id,
      epicAccountId: customer.epicAccountId,
      email: customer.email,
      tier: customer.tier,
      isBlacklisted: customer.isBlacklisted,
      totalOrders: customer.totalOrders,
      totalSpent: customer.totalSpent,
      lifetimeValue: customer.lifetimeValue,
      createdAt: customer.createdAt,
    };

    res.json({
      success: true,
      data: {
        customer: response,
        sessionToken: customer.sessionToken,
      },
    });
  }

  /**
   * Verify customer friendships with bots
   */
  static async verifyFriendship(req: Request, res: Response) {
    const { epicAccountId } = req.query;

    if (!epicAccountId || typeof epicAccountId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'epicAccountId is required',
      });
    }

    const friendships = await prisma.friendship.findMany({
      where: { epicAccountId },
      include: {
        bot: {
          select: {
            id: true,
            name: true,
            epicAccountId: true,
            displayName: true,
            status: true,
            giftsAvailable: true,
          },
        },
      },
    });

    const readyBots = friendships.filter((f) => f.status === 'ACCEPTED');
    const pendingBots = friendships.filter((f) =>
      ['PENDING', 'ACCEPTED', 'WAIT_PERIOD'].includes(f.status)
    );

    // Get all available bots
    const allBots = await prisma.bot.findMany({
      where: {
        isActive: true,
        status: 'ONLINE',
      },
      select: {
        id: true,
        name: true,
        epicAccountId: true,
        displayName: true,
        giftsAvailable: true,
      },
    });

    res.json({
      success: true,
      data: {
        hasFriends: readyBots.length > 0,
        readyBots: readyBots.map((f) => ({
          botId: f.bot.id,
          botName: f.bot.name,
          botEpicId: f.bot.epicAccountId,
          botDisplayName: f.bot.displayName,
          giftsAvailable: f.bot.giftsAvailable,
          canGiftAt: f.canGiftAt,
        })),
        pendingBots: pendingBots.map((f) => ({
          botId: f.bot.id,
          botName: f.bot.name,
          botEpicId: f.bot.epicAccountId,
          botDisplayName: f.bot.displayName,
          status: f.status,
          canGiftAt: f.canGiftAt,
        })),
        availableBots: allBots.map((bot) => ({
          id: bot.id,
          name: bot.name,
          epicAccountId: bot.epicAccountId,
          displayName: bot.displayName,
          giftsAvailable: bot.giftsAvailable,
        })),
      },
    });
  }

  /**
   * Get customer statistics
   */
  static async getCustomerStats(req: Request, res: Response) {
    const { epicId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { epicAccountId: epicId },
      include: {
        orders: {
          where: {
            status: 'COMPLETED',
          },
          select: {
            productName: true,
            finalPrice: true,
            createdAt: true,
          },
        },
        friendships: {
          include: {
            bot: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      });
    }

    // Top products
    const productMap = new Map<
      string,
      { orderCount: number; totalSpent: number }
    >();
    customer.orders.forEach((order) => {
      const existing = productMap.get(order.productName) || {
        orderCount: 0,
        totalSpent: 0,
      };
      productMap.set(order.productName, {
        orderCount: existing.orderCount + 1,
        totalSpent: existing.totalSpent + order.finalPrice,
      });
    });
    const topProducts = Array.from(productMap.entries())
      .map(([productName, data]) => ({ productName, ...data }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 5);

    // Orders by month
    const monthMap = new Map<
      string,
      { count: number; revenue: number }
    >();
    customer.orders.forEach((order) => {
      const month = order.createdAt.toISOString().substring(0, 7);
      const existing = monthMap.get(month) || { count: 0, revenue: 0 };
      monthMap.set(month, {
        count: existing.count + 1,
        revenue: existing.revenue + order.finalPrice,
      });
    });
    const ordersByMonth = Array.from(monthMap.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const response: CustomerStatsResponse = {
      customer: {
        id: customer.id,
        epicAccountId: customer.epicAccountId,
        email: customer.email,
        tier: customer.tier,
        isBlacklisted: customer.isBlacklisted,
        totalOrders: customer.totalOrders,
        totalSpent: customer.totalSpent,
        lifetimeValue: customer.lifetimeValue,
        createdAt: customer.createdAt,
      },
      topProducts,
      ordersByMonth,
      friendships: customer.friendships.map((f) => ({
        botName: f.bot.name,
        status: f.status,
        canGiftAt: f.canGiftAt,
      })),
    };

    res.json({
      success: true,
      data: response,
    });
  }

  /**
   * List all customers (admin)
   */
  static async listCustomers(req: Request, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const tier = req.query.tier as string | undefined;
    const search = req.query.search as string | undefined;
    const isBlacklisted = req.query.isBlacklisted === 'true';

    const where: any = {};
    if (tier) where.tier = tier;
    if (isBlacklisted !== undefined) where.isBlacklisted = isBlacklisted;
    if (search) {
      where.OR = [
        { epicAccountId: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { lifetimeValue: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        customers,
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
   * Change customer tier (admin)
   */
  static async changeTier(req: Request, res: Response) {
    const { id } = req.params;
    const { tier } = req.body as TierChangeRequest;

    const customer = await prisma.customer.update({
      where: { id },
      data: { tier },
    });

    log.info(`Customer tier changed: ${customer.epicAccountId} -> ${tier}`);

    res.json({
      success: true,
      data: customer,
      message: 'Customer tier updated successfully',
    });
  }

  /**
   * Add customer to blacklist (admin)
   */
  static async addToBlacklist(req: Request, res: Response) {
    const { id } = req.params;
    const { reason } = req.body as { reason: string };
    const userId = (req as any).user?.id || 'system';

    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      });
    }

    // Update customer
    await prisma.customer.update({
      where: { id },
      data: {
        isBlacklisted: true,
        blacklistReason: reason,
      },
    });

    // Add to blacklist table
    await prisma.blacklist.upsert({
      where: { epicAccountId: customer.epicAccountId },
      create: {
        epicAccountId: customer.epicAccountId,
        email: customer.email,
        reason,
        blockedBy: userId,
      },
      update: {
        reason,
        blockedBy: userId,
      },
    });

    log.warn(`Customer blacklisted: ${customer.epicAccountId} - ${reason}`);

    res.json({
      success: true,
      message: 'Customer added to blacklist',
    });
  }

  /**
   * Remove customer from blacklist (admin)
   */
  static async removeFromBlacklist(req: Request, res: Response) {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      });
    }

    // Update customer
    await prisma.customer.update({
      where: { id },
      data: {
        isBlacklisted: false,
        blacklistReason: null,
      },
    });

    // Remove from blacklist table
    await prisma.blacklist.delete({
      where: { epicAccountId: customer.epicAccountId },
    }).catch(() => {
      // Ignore if not found
    });

    log.info(`Customer removed from blacklist: ${customer.epicAccountId}`);

    res.json({
      success: true,
      message: 'Customer removed from blacklist',
    });
  }
}
