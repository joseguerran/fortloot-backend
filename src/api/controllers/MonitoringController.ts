import { Request, Response } from 'express';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import { alertManager } from '../../monitoring/AlertManager';
import { webhookManager } from '../../monitoring/WebhookManager';
import { botManager } from '../../bots/BotManager';
import { BotStatus } from '@prisma/client';

/**
 * MonitoringController - System health and metrics endpoints
 */
export class MonitoringController {
  /**
   * Get overall system health status
   */
  static async getSystemHealth(req: Request, res: Response) {
    try {
      const totalBots = await prisma.bot.count({ where: { isActive: true } });
      const onlineBots = await prisma.bot.count({
        where: { isActive: true, status: BotStatus.ONLINE },
      });
      const errorBots = await prisma.bot.count({
        where: { isActive: true, status: BotStatus.ERROR },
      });

      const pendingOrders = await prisma.order.count({
        where: { status: 'PENDING' },
      });

      const queuedOrders = await prisma.order.count({
        where: { status: 'QUEUED' },
      });

      const processingOrders = await prisma.order.count({
        where: { status: 'PROCESSING' },
      });

      // Calculate system health score
      const botHealthScore = totalBots > 0 ? (onlineBots / totalBots) * 100 : 0;

      const systemHealth = {
        status: botHealthScore >= 70 ? 'healthy' : botHealthScore >= 50 ? 'degraded' : 'critical',
        timestamp: new Date(),
        bots: {
          total: totalBots,
          online: onlineBots,
          offline: totalBots - onlineBots - errorBots,
          error: errorBots,
          healthScore: Math.round(botHealthScore),
        },
        orders: {
          pending: pendingOrders,
          queued: queuedOrders,
          processing: processingOrders,
          backlog: pendingOrders + queuedOrders,
        },
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      };

      res.json({
        success: true,
        data: systemHealth,
      });
    } catch (error) {
      log.error('Failed to get system health', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to retrieve system health',
      });
    }
  }

  /**
   * Get detailed bot metrics
   */
  static async getBotMetrics(req: Request, res: Response) {
    const { period = '24h' } = req.query;

    try {
      // Calculate time range
      const hours = period === '7d' ? 168 : period === '30d' ? 720 : 24;
      const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

      const metrics = await prisma.botMetric.findMany({
        where: {
          date: { gte: startDate },
        },
        orderBy: { date: 'desc' },
      });

      // Aggregate metrics
      const totalGiftsAttempted = metrics.reduce((sum, m) => sum + m.giftsAttempted, 0);
      const totalGiftsSuccessful = metrics.reduce((sum, m) => sum + m.giftsSuccessful, 0);
      const totalGiftsFailed = metrics.reduce((sum, m) => sum + m.giftsFailed, 0);

      const successRate =
        totalGiftsAttempted > 0 ? (totalGiftsSuccessful / totalGiftsAttempted) * 100 : 0;

      const avgProcessingTime =
        metrics.length > 0
          ? metrics.reduce((sum, m) => sum + m.avgProcessingTime, 0) / metrics.length
          : 0;

      const summary = {
        period,
        metrics: {
          giftsAttempted: totalGiftsAttempted,
          giftsSuccessful: totalGiftsSuccessful,
          giftsFailed: totalGiftsFailed,
          successRate: Math.round(successRate * 100) / 100,
          avgProcessingTime: Math.round(avgProcessingTime),
        },
        data: metrics,
      };

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      log.error('Failed to get bot metrics', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to retrieve bot metrics',
      });
    }
  }

  /**
   * Get system analytics
   */
  static async getAnalytics(req: Request, res: Response) {
    const { period = '7d' } = req.query;

    try {
      const days = period === '30d' ? 30 : 7;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const analytics = await prisma.analytics.findMany({
        where: {
          date: { gte: startDate },
        },
        orderBy: { date: 'desc' },
      });

      // Calculate totals
      const totalRevenue = analytics.reduce((sum, a) => sum + a.totalRevenue, 0);
      const totalOrdersCompleted = analytics.reduce((sum, a) => sum + a.ordersCompleted, 0);
      const totalOrdersFailed = analytics.reduce((sum, a) => sum + a.ordersFailed, 0);

      const avgSuccessRate =
        analytics.length > 0
          ? analytics.reduce((sum, a) => sum + a.successRate, 0) / analytics.length
          : 0;

      const summary = {
        period,
        totals: {
          revenue: totalRevenue,
          ordersCompleted: totalOrdersCompleted,
          ordersFailed: totalOrdersFailed,
          avgSuccessRate: Math.round(avgSuccessRate * 100) / 100,
        },
        daily: analytics,
      };

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      log.error('Failed to get analytics', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to retrieve analytics',
      });
    }
  }

  /**
   * Get audit logs
   */
  static async getAuditLogs(req: Request, res: Response) {
    const {
      limit = 100,
      offset = 0,
      action,
      resource,
      userId,
    } = req.query;

    try {
      const where: any = {};

      if (action) where.action = action;
      if (resource) where.resource = resource;
      if (userId) where.userId = userId;

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      });

      const total = await prisma.auditLog.count({ where });

      res.json({
        success: true,
        data: {
          logs,
          pagination: {
            total,
            limit: Number(limit),
            offset: Number(offset),
          },
        },
      });
    } catch (error) {
      log.error('Failed to get audit logs', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to retrieve audit logs',
      });
    }
  }

  /**
   * Get alert configuration
   */
  static async getAlertConfig(req: Request, res: Response) {
    try {
      const thresholds = alertManager.getThresholds();

      res.json({
        success: true,
        data: {
          thresholds,
          webhooksConfigured: process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || process.env.WEBHOOK_URL ? true : false,
        },
      });
    } catch (error) {
      log.error('Failed to get alert config', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to retrieve alert configuration',
      });
    }
  }

  /**
   * Update alert thresholds
   */
  static async updateAlertConfig(req: Request, res: Response) {
    try {
      const thresholds = req.body;

      alertManager.updateThresholds(thresholds);

      res.json({
        success: true,
        message: 'Alert thresholds updated successfully',
        data: alertManager.getThresholds(),
      });
    } catch (error) {
      log.error('Failed to update alert config', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to update alert configuration',
      });
    }
  }

  /**
   * Test webhook
   */
  static async testWebhook(req: Request, res: Response) {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Webhook URL is required',
      });
    }

    try {
      const result = await webhookManager.testWebhook(url);

      if (result.success) {
        res.json({
          success: true,
          message: 'Webhook test successful',
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'WEBHOOK_TEST_FAILED',
          message: result.message,
        });
      }
    } catch (error) {
      log.error('Failed to test webhook', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to test webhook',
      });
    }
  }

  /**
   * Trigger manual health check
   */
  static async triggerHealthCheck(req: Request, res: Response) {
    try {
      // Run health check asynchronously
      alertManager.monitorSystemHealth().catch((error) => {
        log.error('Health check failed', error);
      });

      res.json({
        success: true,
        message: 'Health check triggered',
      });
    } catch (error) {
      log.error('Failed to trigger health check', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to trigger health check',
      });
    }
  }

  /**
   * Get recent errors
   */
  static async getRecentErrors(req: Request, res: Response) {
    const { limit = 50 } = req.query;

    try {
      // Get bots with recent errors
      const botsWithErrors = await prisma.bot.findMany({
        where: {
          lastError: { not: null },
        },
        orderBy: { updatedAt: 'desc' },
        take: Number(limit),
        select: {
          id: true,
          name: true,
          lastError: true,
          errorCount: true,
          status: true,
          updatedAt: true,
        },
      });

      // Get failed gifts
      const failedGifts = await prisma.gift.findMany({
        where: {
          status: 'FAILED',
        },
        orderBy: { updatedAt: 'desc' },
        take: Number(limit),
        select: {
          id: true,
          botId: true,
          orderId: true,
          errorMessage: true,
          retryCount: true,
          updatedAt: true,
        },
      });

      // Get failed audit logs
      const failedAudits = await prisma.auditLog.findMany({
        where: {
          success: false,
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
      });

      res.json({
        success: true,
        data: {
          botErrors: botsWithErrors,
          failedGifts: failedGifts.slice(0, 20),
          failedOperations: failedAudits.slice(0, 20),
        },
      });
    } catch (error) {
      log.error('Failed to get recent errors', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to retrieve recent errors',
      });
    }
  }

  /**
   * Get pool statistics
   */
  static async getPoolStats(req: Request, res: Response) {
    try {
      const poolStats = botManager.getPoolStats();

      res.json({
        success: true,
        data: poolStats,
      });
    } catch (error) {
      log.error('Failed to get pool stats', error);
      res.status(500).json({
        success: false,
        error: 'SYSTEM_ERROR',
        message: 'Failed to retrieve pool statistics',
      });
    }
  }

  /**
   * Server-Sent Events endpoint for real-time monitoring
   * Streams system metrics every 5 seconds
   */
  static async streamMetrics(req: Request, res: Response) {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    log.info('SSE client connected', { ip: req.ip });

    // Send initial connection message
    res.write('data: {"type":"connected","message":"Real-time stream started"}\n\n');

    // Function to send metrics
    const sendMetrics = async () => {
      try {
        // Get bot stats
        const totalBots = await prisma.bot.count({ where: { isActive: true } });
        const onlineBots = await prisma.bot.count({
          where: { isActive: true, status: BotStatus.ONLINE },
        });
        const errorBots = await prisma.bot.count({
          where: { isActive: true, status: BotStatus.ERROR },
        });

        // Get order stats
        const pendingOrders = await prisma.order.count({
          where: { status: 'PENDING' },
        });
        const queuedOrders = await prisma.order.count({
          where: { status: 'QUEUED' },
        });
        const processingOrders = await prisma.order.count({
          where: { status: 'PROCESSING' },
        });

        // Get pool stats
        const poolStats = botManager.getPoolStats();

        // Calculate health score
        const botHealthScore = totalBots > 0 ? (onlineBots / totalBots) * 100 : 0;

        const metrics = {
          type: 'metrics',
          timestamp: new Date().toISOString(),
          data: {
            bots: {
              total: totalBots,
              online: onlineBots,
              offline: totalBots - onlineBots - errorBots,
              error: errorBots,
              healthScore: Math.round(botHealthScore),
            },
            orders: {
              pending: pendingOrders,
              queued: queuedOrders,
              processing: processingOrders,
              backlog: pendingOrders + queuedOrders,
            },
            pool: poolStats,
            system: {
              uptime: process.uptime(),
              memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
              },
            },
          },
        };

        res.write(`data: ${JSON.stringify(metrics)}\n\n`);
      } catch (error) {
        log.error('Failed to send SSE metrics', error);
      }
    };

    // Send metrics immediately
    await sendMetrics();

    // Send metrics every 5 seconds
    const interval = setInterval(sendMetrics, 5000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(interval);
      log.info('SSE client disconnected', { ip: req.ip });
    });
  }
}
