import { prisma } from '../database/client';
import { KPIService } from './KPIService';
import { log } from '../utils/logger';

/**
 * Service for automatic metrics updates and customer stats synchronization
 */
export class MetricsService {
  /**
   * Update customer statistics (orders, spent, lifetime value)
   */
  static async updateCustomerStats(customerId: string): Promise<void> {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          orders: {
            where: {
              status: { in: ['COMPLETED', 'PAYMENT_VERIFIED'] },
            },
            select: {
              finalPrice: true,
              profitAmount: true,
            },
          },
        },
      });

      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      const totalOrders = customer.orders.length;
      const totalSpent = customer.orders.reduce((sum, o) => sum + (o.finalPrice || 0), 0);
      const lifetimeValue = customer.orders.reduce((sum, o) => sum + (o.profitAmount || 0), 0);

      await prisma.customer.update({
        where: { id: customerId },
        data: {
          totalOrders,
          totalSpent,
          lifetimeValue,
        },
      });

      log.info(`Customer stats updated for ${customer.epicAccountId}`);
    } catch (error) {
      log.error(`Error updating customer stats for ${customerId}:`, error);
      throw error;
    }
  }

  /**
   * Store daily business metrics snapshot
   */
  static async storeDailyMetrics(): Promise<void> {
    try {
      await KPIService.storeMetricsSnapshot();
      log.info('Daily metrics snapshot stored successfully');
    } catch (error) {
      log.error('Error storing daily metrics:', error);
      throw error;
    }
  }

  /**
   * Clean up expired orders
   */
  static async cleanupExpiredOrders(): Promise<void> {
    try {
      const now = new Date();

      const result = await prisma.order.updateMany({
        where: {
          status: { in: ['PENDING', 'PENDING_PAYMENT'] },
          expiresAt: { lte: now },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      if (result.count > 0) {
        log.info(`Marked ${result.count} orders as expired`);
      }
    } catch (error) {
      log.error('Error cleaning up expired orders:', error);
      throw error;
    }
  }

  /**
   * Process pending friendship checks
   */
  static async processPendingFriendships(): Promise<void> {
    try {
      const orders = await prisma.order.findMany({
        where: {
          status: 'WAITING_FRIENDSHIP',
        },
        include: {
          customer: true,
        },
        take: 50,
      });

      for (const order of orders) {
        if (!order.customer) continue;

        // Check if customer now has a ready friendship
        const readyFriendship = await prisma.friendship.findFirst({
          where: {
            epicAccountId: order.customer.epicAccountId,
            status: 'READY',
          },
        });

        if (readyFriendship) {
          // Move order to next stage
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: 'WAITING_PERIOD',
            },
          });

          log.info(`Order ${order.orderNumber} moved to WAITING_PERIOD`);
        }
      }
    } catch (error) {
      log.error('Error processing pending friendships:', error);
      throw error;
    }
  }

  /**
   * Auto-tier customers based on spending
   */
  static async autoTierCustomers(): Promise<void> {
    try {
      // Get config thresholds (can be moved to PricingConfig or separate config)
      const VIP_THRESHOLD = 100; // $100 total spent
      const PREMIUM_THRESHOLD = 500; // $500 total spent

      // Upgrade to VIP
      await prisma.customer.updateMany({
        where: {
          tier: 'REGULAR',
          totalSpent: { gte: VIP_THRESHOLD },
        },
        data: {
          tier: 'VIP',
        },
      });

      // Upgrade to PREMIUM
      await prisma.customer.updateMany({
        where: {
          tier: { in: ['REGULAR', 'VIP'] },
          totalSpent: { gte: PREMIUM_THRESHOLD },
        },
        data: {
          tier: 'PREMIUM',
        },
      });

      log.info('Auto-tier customers process completed');
    } catch (error) {
      log.error('Error auto-tiering customers:', error);
      throw error;
    }
  }

  /**
   * Run all scheduled maintenance tasks
   */
  static async runScheduledMaintenance(): Promise<void> {
    log.info('Starting scheduled maintenance...');

    try {
      await this.cleanupExpiredOrders();
      await this.processPendingFriendships();
      await this.autoTierCustomers();

      log.info('Scheduled maintenance completed successfully');
    } catch (error) {
      log.error('Error during scheduled maintenance:', error);
    }
  }
}
