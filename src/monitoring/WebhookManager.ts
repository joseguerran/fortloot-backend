import axios, { AxiosError } from 'axios';
import { log } from '../utils/logger';
import { config } from '../config';

/**
 * Webhook manager for sending notifications to external services
 * Supports Discord, Slack, and generic webhooks
 */

export enum WebhookType {
  DISCORD = 'discord',
  SLACK = 'slack',
  GENERIC = 'generic',
}

export enum WebhookEvent {
  BOT_ONLINE = 'bot.online',
  BOT_OFFLINE = 'bot.offline',
  BOT_ERROR = 'bot.error',
  ORDER_COMPLETED = 'order.completed',
  ORDER_FAILED = 'order.failed',
  GIFT_SENT = 'gift.sent',
  GIFT_FAILED = 'gift.failed',
  SYSTEM_ERROR = 'system.error',
  RATE_LIMIT_HIT = 'rate_limit.hit',
  SECURITY_ALERT = 'security.alert',
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: Date;
  data: any;
  severity?: 'info' | 'warning' | 'error' | 'critical';
}

export interface WebhookConfig {
  type: WebhookType;
  url: string;
  enabled: boolean;
  events?: WebhookEvent[]; // If specified, only these events are sent
}

/**
 * Webhook Manager class
 */
export class WebhookManager {
  private webhooks: WebhookConfig[] = [];
  private retryQueue: Map<string, { payload: WebhookPayload; webhook: WebhookConfig }[]> =
    new Map();

  constructor() {
    this.loadWebhooks();
  }

  /**
   * Load webhooks from environment
   */
  private loadWebhooks(): void {
    // Discord webhook
    if (process.env.DISCORD_WEBHOOK_URL) {
      this.webhooks.push({
        type: WebhookType.DISCORD,
        url: process.env.DISCORD_WEBHOOK_URL,
        enabled: true,
      });
      log.info('Discord webhook configured');
    }

    // Slack webhook
    if (process.env.SLACK_WEBHOOK_URL) {
      this.webhooks.push({
        type: WebhookType.SLACK,
        url: process.env.SLACK_WEBHOOK_URL,
        enabled: true,
      });
      log.info('Slack webhook configured');
    }

    // Generic webhook
    if (process.env.WEBHOOK_URL) {
      this.webhooks.push({
        type: WebhookType.GENERIC,
        url: process.env.WEBHOOK_URL,
        enabled: true,
      });
      log.info('Generic webhook configured');
    }

    if (this.webhooks.length === 0) {
      log.warn('No webhooks configured');
    }
  }

  /**
   * Register a webhook programmatically
   */
  registerWebhook(webhook: WebhookConfig): void {
    this.webhooks.push(webhook);
    log.info('Webhook registered', { type: webhook.type, url: webhook.url });
  }

  /**
   * Remove a webhook by URL
   */
  removeWebhook(url: string): void {
    this.webhooks = this.webhooks.filter((w) => w.url !== url);
    log.info('Webhook removed', { url });
  }

  /**
   * Send webhook notification
   */
  async send(payload: WebhookPayload): Promise<void> {
    const activeWebhooks = this.webhooks.filter((w) => {
      if (!w.enabled) return false;
      if (w.events && !w.events.includes(payload.event)) return false;
      return true;
    });

    if (activeWebhooks.length === 0) {
      log.debug('No active webhooks for event', { event: payload.event });
      return;
    }

    // Send to all active webhooks in parallel
    await Promise.allSettled(
      activeWebhooks.map((webhook) => this.sendToWebhook(webhook, payload))
    );
  }

  /**
   * Send to individual webhook with retry logic
   */
  private async sendToWebhook(
    webhook: WebhookConfig,
    payload: WebhookPayload,
    retryCount = 0
  ): Promise<void> {
    try {
      const formattedPayload = this.formatPayload(webhook.type, payload);

      const response = await axios.post(webhook.url, formattedPayload, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Fortloot-Bot/1.0',
        },
        timeout: 5000,
      });

      log.debug('Webhook sent successfully', {
        type: webhook.type,
        event: payload.event,
        status: response.status,
      });
    } catch (error) {
      log.error('Failed to send webhook', {
        type: webhook.type,
        event: payload.event,
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount,
      });

      // Retry up to 3 times with exponential backoff
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        setTimeout(() => {
          this.sendToWebhook(webhook, payload, retryCount + 1);
        }, delay);
      }
    }
  }

  /**
   * Format payload for different webhook types
   */
  private formatPayload(type: WebhookType, payload: WebhookPayload): any {
    switch (type) {
      case WebhookType.DISCORD:
        return this.formatDiscord(payload);

      case WebhookType.SLACK:
        return this.formatSlack(payload);

      case WebhookType.GENERIC:
      default:
        return payload;
    }
  }

  /**
   * Format for Discord webhook
   */
  private formatDiscord(payload: WebhookPayload): any {
    const color = this.getSeverityColor(payload.severity || 'info');
    const emoji = this.getSeverityEmoji(payload.severity || 'info');

    return {
      embeds: [
        {
          title: `${emoji} ${this.getEventTitle(payload.event)}`,
          description: this.getEventDescription(payload),
          color: color,
          fields: this.getEventFields(payload),
          timestamp: payload.timestamp.toISOString(),
          footer: {
            text: 'Fortloot Bot System',
          },
        },
      ],
    };
  }

  /**
   * Format for Slack webhook
   */
  private formatSlack(payload: WebhookPayload): any {
    const emoji = this.getSeverityEmoji(payload.severity || 'info');

    return {
      text: `${emoji} ${this.getEventTitle(payload.event)}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} ${this.getEventTitle(payload.event)}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: this.getEventDescription(payload),
          },
        },
        {
          type: 'section',
          fields: this.getEventFields(payload).map((field) => ({
            type: 'mrkdwn',
            text: `*${field.name}*\n${field.value}`,
          })),
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Fortloot Bot System | ${new Date(payload.timestamp).toLocaleString()}`,
            },
          ],
        },
      ],
    };
  }

  /**
   * Get severity color for Discord
   */
  private getSeverityColor(severity: string): number {
    const colors: Record<string, number> = {
      info: 0x3498db, // Blue
      warning: 0xf39c12, // Orange
      error: 0xe74c3c, // Red
      critical: 0x992d22, // Dark red
    };
    return colors[severity] || colors.info;
  }

  /**
   * Get severity emoji
   */
  private getSeverityEmoji(severity: string): string {
    const emojis: Record<string, string> = {
      info: '🔵',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };
    return emojis[severity] || '📢';
  }

  /**
   * Get event title
   */
  private getEventTitle(event: WebhookEvent): string {
    const titles: Record<WebhookEvent, string> = {
      [WebhookEvent.BOT_ONLINE]: 'Bot Online',
      [WebhookEvent.BOT_OFFLINE]: 'Bot Offline',
      [WebhookEvent.BOT_ERROR]: 'Bot Error',
      [WebhookEvent.ORDER_COMPLETED]: 'Order Completed',
      [WebhookEvent.ORDER_FAILED]: 'Order Failed',
      [WebhookEvent.GIFT_SENT]: 'Gift Sent',
      [WebhookEvent.GIFT_FAILED]: 'Gift Failed',
      [WebhookEvent.SYSTEM_ERROR]: 'System Error',
      [WebhookEvent.RATE_LIMIT_HIT]: 'Rate Limit Hit',
      [WebhookEvent.SECURITY_ALERT]: 'Security Alert',
    };
    return titles[event] || 'System Event';
  }

  /**
   * Get event description
   */
  private getEventDescription(payload: WebhookPayload): string {
    const { event, data } = payload;

    switch (event) {
      case WebhookEvent.BOT_ONLINE:
        return `Bot **${data.botName}** is now online and ready to process orders.`;

      case WebhookEvent.BOT_OFFLINE:
        return `Bot **${data.botName}** has gone offline.`;

      case WebhookEvent.BOT_ERROR:
        return `Bot **${data.botName}** encountered an error: ${data.error}`;

      case WebhookEvent.ORDER_COMPLETED:
        return `Order **${data.orderId}** has been completed successfully.`;

      case WebhookEvent.ORDER_FAILED:
        return `Order **${data.orderId}** failed: ${data.reason}`;

      case WebhookEvent.GIFT_SENT:
        return `Gift sent to **${data.recipientName}**.`;

      case WebhookEvent.GIFT_FAILED:
        return `Failed to send gift: ${data.error}`;

      case WebhookEvent.SYSTEM_ERROR:
        return `System error: ${data.message}`;

      case WebhookEvent.RATE_LIMIT_HIT:
        return `Rate limit hit on endpoint: ${data.path}`;

      case WebhookEvent.SECURITY_ALERT:
        return `Security alert: ${data.message}`;

      default:
        return 'System event occurred.';
    }
  }

  /**
   * Get event fields for detailed information
   */
  private getEventFields(payload: WebhookPayload): Array<{ name: string; value: string; inline?: boolean }> {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    const data = payload.data;

    // Add common fields
    if (data.botId) {
      fields.push({ name: 'Bot ID', value: data.botId, inline: true });
    }

    if (data.botName) {
      fields.push({ name: 'Bot Name', value: data.botName, inline: true });
    }

    if (data.orderId) {
      fields.push({ name: 'Order ID', value: data.orderId, inline: true });
    }

    if (data.customerName) {
      fields.push({ name: 'Customer', value: data.customerName, inline: true });
    }

    if (data.error) {
      fields.push({ name: 'Error', value: data.error, inline: false });
    }

    if (data.reason) {
      fields.push({ name: 'Reason', value: data.reason, inline: false });
    }

    // Add severity
    if (payload.severity) {
      fields.push({ name: 'Severity', value: payload.severity.toUpperCase(), inline: true });
    }

    return fields;
  }

  /**
   * Test webhook connection
   */
  async testWebhook(url: string): Promise<{ success: boolean; message: string }> {
    try {
      const testPayload: WebhookPayload = {
        event: WebhookEvent.SYSTEM_ERROR,
        timestamp: new Date(),
        data: {
          message: 'This is a test webhook notification from Fortloot Bot',
        },
        severity: 'info',
      };

      const webhook: WebhookConfig = {
        type: WebhookType.GENERIC,
        url,
        enabled: true,
      };

      await this.sendToWebhook(webhook, testPayload);

      return {
        success: true,
        message: 'Webhook test successful',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const webhookManager = new WebhookManager();
