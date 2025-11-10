import { Request, Response } from 'express';
import { prisma } from '../../database/client';
import { MetricsResponse } from '../../types';
import { calculateSuccessRate } from '../../utils/helpers';

export class AnalyticsController {
  /**
   * Get metrics for a specific period
   */
  static async getMetrics(req: Request, res: Response) {
    const period = (req.query.period as string) || 'today';

    let startDate: Date;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    // Get order stats
    const orders = await prisma.order.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
    });

    const totalOrders = orders.length;
    const completedOrders = orders.filter((o) => o.status === 'COMPLETED').length;
    const failedOrders = orders.filter((o) => o.status === 'FAILED').length;
    const pendingOrders = orders.filter(
      (o) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(o.status)
    ).length;

    // Get gift stats
    const gifts = await prisma.gift.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
    });

    // Get bot stats
    const bots = await prisma.bot.findMany({
      where: { isActive: true },
    });

    const onlineBots = bots.filter((b) => b.status === 'ONLINE').length;
    const totalGiftsUsed = bots.reduce((sum, bot) => sum + bot.giftsToday, 0);
    const totalGiftsAvailable = bots.reduce((sum, bot) => sum + bot.giftsAvailable, 0);
    const maxGifts = bots.reduce((sum, bot) => sum + bot.maxGiftsPerDay, 0);
    const utilizationRate = maxGifts > 0 ? (totalGiftsUsed / maxGifts) * 100 : 0;

    // Calculate delivery time
    const completedOrdersWithTime = orders.filter(
      (o) => o.status === 'COMPLETED' && o.completedAt
    );
    const avgDeliveryTime =
      completedOrdersWithTime.length > 0
        ? completedOrdersWithTime.reduce((sum, order) => {
            const deliveryTime =
              (order.completedAt!.getTime() - order.createdAt.getTime()) / 1000 / 60 / 60;
            return sum + deliveryTime;
          }, 0) / completedOrdersWithTime.length
        : 0;

    // Calculate revenue
    const totalRevenue = orders
      .filter((o) => o.status === 'COMPLETED')
      .reduce((sum, order) => sum + order.price, 0);
    const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

    const metrics: MetricsResponse = {
      period: period as any,
      orders: {
        total: totalOrders,
        completed: completedOrders,
        failed: failedOrders,
        pending: pendingOrders,
        successRate: calculateSuccessRate(completedOrders, totalOrders),
      },
      bots: {
        total: bots.length,
        online: onlineBots,
        utilizationRate: Math.round(utilizationRate * 100) / 100,
        avgGiftsPerBot: bots.length > 0 ? totalGiftsUsed / bots.length : 0,
      },
      performance: {
        avgDeliveryTime: Math.round(avgDeliveryTime * 100) / 100,
        avgProcessingTime: 0, // TODO: Calculate from bot metrics
        uptime: 0, // TODO: Calculate system uptime
      },
      revenue: {
        total: Math.round(totalRevenue * 100) / 100,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      },
    };

    res.json({
      success: true,
      data: metrics,
    });
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(req: Request, res: Response) {
    const queueManager = require('../../queue/QueueManager').queueManager;
    const stats = await queueManager.getAllQueueStats();

    res.json({
      success: true,
      data: stats,
    });
  }

  /**
   * Get system health
   */
  static async getSystemHealth(req: Request, res: Response) {
    const botManager = require('../../bots/BotManager').botManager;
    const botStats = botManager.getPoolStats();

    const queueManager = require('../../queue/QueueManager').queueManager;
    const queueStats = await queueManager.getAllQueueStats();

    // Check database connectivity
    let dbHealthy = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbHealthy = false;
    }

    const health = {
      status: 'healthy',
      timestamp: new Date(),
      components: {
        database: {
          status: dbHealthy ? 'healthy' : 'unhealthy',
        },
        bots: {
          status: botStats.online > 0 ? 'healthy' : 'degraded',
          online: botStats.online,
          total: botStats.total,
        },
        queues: {
          status: 'healthy',
          friendship: queueStats.friendship.total,
          gift: queueStats.gift.total,
          verification: queueStats.verification.total,
        },
      },
    };

    res.json({
      success: true,
      data: health,
    });
  }

  /**
   * Get checkout abandonment analytics
   */
  static async getCheckoutAbandonment(req: Request, res: Response) {
    const period = (req.query.period as string) || 'week';
    const limit = parseInt(req.query.limit as string) || 50;

    let startDate: Date;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get all orders that started checkout but didn't complete
    const abandonedOrders = await prisma.order.findMany({
      where: {
        checkoutStartedAt: {
          gte: startDate,
        },
        status: {
          in: ['PENDING_PAYMENT', 'ABANDONED', 'EXPIRED'],
        },
      },
      orderBy: {
        checkoutStartedAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        customerEpicId: true,
        customerName: true,
        customerEmail: true,
        epicAccountIdConfirmed: true,
        emailConfirmed: true,
        productName: true,
        productType: true,
        finalPrice: true,
        hasManualItems: true,
        status: true,
        checkoutStartedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    // Get stats for the period
    const totalCheckouts = await prisma.order.count({
      where: {
        checkoutStartedAt: {
          gte: startDate,
        },
      },
    });

    const completedCheckouts = await prisma.order.count({
      where: {
        checkoutStartedAt: {
          gte: startDate,
        },
        status: {
          in: ['COMPLETED', 'PAYMENT_VERIFIED', 'PROCESSING', 'QUEUED'],
        },
      },
    });

    const abandonedCheckouts = abandonedOrders.length;

    const abandonmentRate = totalCheckouts > 0
      ? Math.round((abandonedCheckouts / totalCheckouts) * 10000) / 100
      : 0;

    const conversionRate = totalCheckouts > 0
      ? Math.round((completedCheckouts / totalCheckouts) * 10000) / 100
      : 0;

    // Stats by item type
    const manualItemsAbandoned = abandonedOrders.filter(o => o.hasManualItems).length;
    const autoItemsAbandoned = abandonedOrders.filter(o => !o.hasManualItems).length;

    // Orders with captured data (valuable for follow-up)
    const ordersWithContact = abandonedOrders.filter(
      o => o.epicAccountIdConfirmed || o.emailConfirmed
    );

    res.json({
      success: true,
      data: {
        summary: {
          period,
          totalCheckouts,
          completedCheckouts,
          abandonedCheckouts,
          abandonmentRate,
          conversionRate,
          manualItemsAbandoned,
          autoItemsAbandoned,
          ordersWithContactInfo: ordersWithContact.length,
        },
        abandonedOrders: abandonedOrders.map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          epicAccountId: order.epicAccountIdConfirmed || order.customerEpicId,
          email: order.emailConfirmed || order.customerEmail,
          productName: order.productName,
          productType: order.productType,
          price: order.finalPrice,
          hasManualItems: order.hasManualItems,
          status: order.status,
          checkoutStartedAt: order.checkoutStartedAt,
          expiresAt: order.expiresAt,
          hasContactInfo: !!(order.epicAccountIdConfirmed || order.emailConfirmed),
        })),
      },
    });
  }
}
