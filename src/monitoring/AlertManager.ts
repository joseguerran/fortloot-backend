import { webhookManager, WebhookEvent, WebhookPayload } from './WebhookManager';
import { prisma } from '../database/client';
import { log } from '../utils/logger';
import { BotStatus } from '@prisma/client';

/**
 * Alert Manager for automated monitoring and alerting
 * Monitors system health and sends alerts for critical events
 */

export interface AlertThresholds {
  maxErrorCount: number; // Max errors before alerting
  minBotUptime: number; // Minimum percentage of bots that should be online
  maxGiftFailureRate: number; // Max gift failure rate (percentage)
  maxOrderBacklog: number; // Max orders in queue before alerting
  inactivityThresholdMinutes: number; // Alert if bot inactive for X minutes
}

export class AlertManager {
  private thresholds: AlertThresholds = {
    maxErrorCount: 5,
    minBotUptime: 0.7, // 70% of bots should be online
    maxGiftFailureRate: 0.2, // 20% failure rate
    maxOrderBacklog: 100,
    inactivityThresholdMinutes: 10,
  };

  private alertCooldowns: Map<string, Date> = new Map();
  private cooldownPeriodMs = 30 * 60 * 1000; // 30 minutes

  /**
   * Check if alert should be sent (respects cooldown)
   */
  private shouldAlert(alertKey: string): boolean {
    const lastAlert = this.alertCooldowns.get(alertKey);
    if (!lastAlert) {
      return true;
    }

    const timeSinceLastAlert = Date.now() - lastAlert.getTime();
    return timeSinceLastAlert > this.cooldownPeriodMs;
  }

  /**
   * Mark alert as sent
   */
  private markAlertSent(alertKey: string): void {
    this.alertCooldowns.set(alertKey, new Date());
  }

  /**
   * Send alert via webhook
   */
  private async sendAlert(payload: WebhookPayload): Promise<void> {
    await webhookManager.send(payload);
    log.info('Alert sent', { event: payload.event, severity: payload.severity });
  }

  /**
   * Alert: Bot went offline
   */
  async alertBotOffline(botId: string, botName: string, reason?: string): Promise<void> {
    const alertKey = `bot-offline-${botId}`;

    if (!this.shouldAlert(alertKey)) {
      log.debug('Alert skipped (cooldown)', { alertKey });
      return;
    }

    await this.sendAlert({
      event: WebhookEvent.BOT_OFFLINE,
      timestamp: new Date(),
      data: {
        botId,
        botName,
        reason: reason || 'Unknown',
      },
      severity: 'warning',
    });

    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Bot came online
   */
  async alertBotOnline(botId: string, botName: string): Promise<void> {
    await this.sendAlert({
      event: WebhookEvent.BOT_ONLINE,
      timestamp: new Date(),
      data: {
        botId,
        botName,
      },
      severity: 'info',
    });
  }

  /**
   * Alert: Bot error threshold exceeded
   */
  async alertBotErrors(botId: string, botName: string, errorCount: number, lastError?: string): Promise<void> {
    const alertKey = `bot-errors-${botId}`;

    if (errorCount < this.thresholds.maxErrorCount) {
      return; // Below threshold
    }

    if (!this.shouldAlert(alertKey)) {
      log.debug('Alert skipped (cooldown)', { alertKey });
      return;
    }

    await this.sendAlert({
      event: WebhookEvent.BOT_ERROR,
      timestamp: new Date(),
      data: {
        botId,
        botName,
        errorCount,
        error: lastError || 'Multiple errors',
        threshold: this.thresholds.maxErrorCount,
      },
      severity: 'error',
    });

    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Bot inactive for too long
   */
  async alertBotInactive(botId: string, botName: string, minutesSinceHeartbeat: number): Promise<void> {
    const alertKey = `bot-inactive-${botId}`;

    if (minutesSinceHeartbeat < this.thresholds.inactivityThresholdMinutes) {
      return;
    }

    if (!this.shouldAlert(alertKey)) {
      return;
    }

    await this.sendAlert({
      event: WebhookEvent.BOT_ERROR,
      timestamp: new Date(),
      data: {
        botId,
        botName,
        error: `Bot has been inactive for ${minutesSinceHeartbeat} minutes`,
        minutesSinceHeartbeat,
      },
      severity: 'warning',
    });

    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Low bot availability
   */
  async alertLowBotAvailability(onlineBots: number, totalBots: number): Promise<void> {
    const alertKey = 'low-bot-availability';

    const uptimePercentage = totalBots > 0 ? onlineBots / totalBots : 0;

    if (uptimePercentage >= this.thresholds.minBotUptime) {
      return; // Above threshold
    }

    if (!this.shouldAlert(alertKey)) {
      return;
    }

    await this.sendAlert({
      event: WebhookEvent.SYSTEM_ERROR,
      timestamp: new Date(),
      data: {
        message: `Low bot availability: ${onlineBots}/${totalBots} bots online (${Math.round(uptimePercentage * 100)}%)`,
        onlineBots,
        totalBots,
        uptimePercentage: Math.round(uptimePercentage * 100),
        threshold: Math.round(this.thresholds.minBotUptime * 100),
      },
      severity: 'critical',
    });

    this.markAlertSent(alertKey);
  }

  /**
   * Alert: High gift failure rate
   */
  async alertHighGiftFailureRate(
    failedGifts: number,
    totalGifts: number,
    timeWindowHours: number
  ): Promise<void> {
    const alertKey = 'high-gift-failure-rate';

    const failureRate = totalGifts > 0 ? failedGifts / totalGifts : 0;

    if (failureRate < this.thresholds.maxGiftFailureRate) {
      return;
    }

    if (!this.shouldAlert(alertKey)) {
      return;
    }

    await this.sendAlert({
      event: WebhookEvent.GIFT_FAILED,
      timestamp: new Date(),
      data: {
        message: `High gift failure rate: ${Math.round(failureRate * 100)}% in the last ${timeWindowHours} hours`,
        failedGifts,
        totalGifts,
        failureRate: Math.round(failureRate * 100),
        threshold: Math.round(this.thresholds.maxGiftFailureRate * 100),
        timeWindowHours,
      },
      severity: 'error',
    });

    this.markAlertSent(alertKey);
  }

  /**
   * Alert: High order backlog
   */
  async alertHighOrderBacklog(pendingOrders: number, queuedOrders: number): Promise<void> {
    const alertKey = 'high-order-backlog';

    const totalBacklog = pendingOrders + queuedOrders;

    if (totalBacklog < this.thresholds.maxOrderBacklog) {
      return;
    }

    if (!this.shouldAlert(alertKey)) {
      return;
    }

    await this.sendAlert({
      event: WebhookEvent.SYSTEM_ERROR,
      timestamp: new Date(),
      data: {
        message: `High order backlog: ${totalBacklog} orders pending/queued`,
        pendingOrders,
        queuedOrders,
        totalBacklog,
        threshold: this.thresholds.maxOrderBacklog,
      },
      severity: 'warning',
    });

    this.markAlertSent(alertKey);
  }

  /**
   * Alert: Order failed
   */
  async alertOrderFailed(orderId: string, customerName: string, reason: string): Promise<void> {
    await this.sendAlert({
      event: WebhookEvent.ORDER_FAILED,
      timestamp: new Date(),
      data: {
        orderId,
        customerName,
        reason,
      },
      severity: 'error',
    });
  }

  /**
   * Alert: Order completed (optional, can be disabled)
   */
  async alertOrderCompleted(orderId: string, customerName: string, botName: string): Promise<void> {
    // Only send if configured (to avoid spam)
    if (!process.env.ALERT_ON_ORDER_COMPLETE) {
      return;
    }

    await this.sendAlert({
      event: WebhookEvent.ORDER_COMPLETED,
      timestamp: new Date(),
      data: {
        orderId,
        customerName,
        botName,
      },
      severity: 'info',
    });
  }

  /**
   * Alert: Security event
   */
  async alertSecurity(message: string, details: any): Promise<void> {
    await this.sendAlert({
      event: WebhookEvent.SECURITY_ALERT,
      timestamp: new Date(),
      data: {
        message,
        ...details,
      },
      severity: 'critical',
    });
  }

  /**
   * Alert: Rate limit exceeded
   */
  async alertRateLimit(path: string, userId?: string, ip?: string): Promise<void> {
    const alertKey = `rate-limit-${userId || ip}`;

    if (!this.shouldAlert(alertKey)) {
      return;
    }

    await this.sendAlert({
      event: WebhookEvent.RATE_LIMIT_HIT,
      timestamp: new Date(),
      data: {
        path,
        userId,
        ip,
        message: `Rate limit exceeded for ${userId || ip} on ${path}`,
      },
      severity: 'warning',
    });

    this.markAlertSent(alertKey);
  }

  /**
   * Monitor system health and send alerts
   * This should be called periodically (e.g., every 5 minutes)
   */
  async monitorSystemHealth(): Promise<void> {
    try {
      log.debug('Running system health check');

      // Check bot availability
      const totalBots = await prisma.bot.count({ where: { isActive: true } });
      const onlineBots = await prisma.bot.count({
        where: { isActive: true, status: BotStatus.ONLINE },
      });

      await this.alertLowBotAvailability(onlineBots, totalBots);

      // Check for bots with high error counts
      const botsWithErrors = await prisma.bot.findMany({
        where: {
          isActive: true,
          errorCount: { gte: this.thresholds.maxErrorCount },
        },
      });

      for (const bot of botsWithErrors) {
        await this.alertBotErrors(bot.id, bot.name, bot.errorCount, bot.lastError || undefined);
      }

      // Check for inactive bots
      const inactiveThreshold = new Date(
        Date.now() - this.thresholds.inactivityThresholdMinutes * 60 * 1000
      );

      const inactiveBots = await prisma.bot.findMany({
        where: {
          isActive: true,
          status: BotStatus.ONLINE,
          lastHeartbeat: { lt: inactiveThreshold },
        },
      });

      for (const bot of inactiveBots) {
        const minutesSinceHeartbeat = Math.floor(
          (Date.now() - bot.lastHeartbeat.getTime()) / 1000 / 60
        );
        await this.alertBotInactive(bot.id, bot.name, minutesSinceHeartbeat);
      }

      // Check gift failure rate (last 24 hours)
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const totalGifts = await prisma.gift.count({
        where: { createdAt: { gte: last24Hours } },
      });

      const failedGifts = await prisma.gift.count({
        where: {
          createdAt: { gte: last24Hours },
          status: 'FAILED',
        },
      });

      if (totalGifts > 0) {
        await this.alertHighGiftFailureRate(failedGifts, totalGifts, 24);
      }

      // Check order backlog
      const pendingOrders = await prisma.order.count({
        where: { status: 'PENDING' },
      });

      const queuedOrders = await prisma.order.count({
        where: { status: 'QUEUED' },
      });

      await this.alertHighOrderBacklog(pendingOrders, queuedOrders);

      log.debug('System health check completed');
    } catch (error) {
      log.error('Error during system health monitoring', error);
    }
  }

  /**
   * Update alert thresholds
   */
  updateThresholds(thresholds: Partial<AlertThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds,
    };
    log.info('Alert thresholds updated', this.thresholds);
  }

  /**
   * Get current thresholds
   */
  getThresholds(): AlertThresholds {
    return { ...this.thresholds };
  }
}

// Export singleton instance
export const alertManager = new AlertManager();
