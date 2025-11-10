import { FortniteBotClient } from './FortniteBotClient';
import { Bot, BotStatus } from '@prisma/client';
import { log } from '../utils/logger';
import { BotHealth } from '../types';
import { calculateGiftsToday, calculateGiftsAvailable } from '../utils/helpers';

/**
 * Pool of bot instances with health tracking
 */
export class BotPool {
  private bots: Map<string, FortniteBotClient> = new Map();
  private botHealth: Map<string, BotHealth> = new Map();

  /**
   * Add a bot to the pool
   */
  addBot(botId: string, client: FortniteBotClient): void {
    this.bots.set(botId, client);

    // Initialize health tracking
    this.botHealth.set(botId, {
      botId,
      status: 'OFFLINE',
      giftsAvailable: 0,
      giftsToday: 0,
      lastHeartbeat: new Date(),
      uptime: 0,
      errorCount: 0,
      isHealthy: false,
    });

    // Set up event listeners
    this.setupBotListeners(botId, client);

    log.info(`Bot ${botId} added to pool`);
  }

  /**
   * Remove a bot from the pool
   */
  async removeBot(botId: string): Promise<void> {
    const client = this.bots.get(botId);

    if (client) {
      await client.logout();
      this.bots.delete(botId);
      this.botHealth.delete(botId);
      log.info(`Bot ${botId} removed from pool`);
    }
  }

  /**
   * Get a bot by ID
   */
  getBot(botId: string): FortniteBotClient | undefined {
    return this.bots.get(botId);
  }

  /**
   * Get bot health status
   */
  getBotHealth(botId: string): BotHealth | undefined {
    return this.botHealth.get(botId);
  }

  /**
   * Get all bots
   */
  getAllBots(): FortniteBotClient[] {
    return Array.from(this.bots.values());
  }

  /**
   * Get all bot IDs
   */
  getAllBotIds(): string[] {
    return Array.from(this.bots.keys());
  }

  /**
   * Get available bots (online and have gifts available)
   */
  getAvailableBots(): Array<{ botId: string; client: FortniteBotClient }> {
    const available: Array<{ botId: string; client: FortniteBotClient }> = [];

    for (const [botId, client] of this.bots.entries()) {
      const health = this.botHealth.get(botId);

      if (health && health.isHealthy && health.giftsAvailable > 0) {
        available.push({ botId, client });
      }
    }

    return available;
  }

  /**
   * Get bot with most available gifts
   */
  getBotWithMostGifts(): { botId: string; client: FortniteBotClient } | null {
    const available = this.getAvailableBots();

    if (available.length === 0) return null;

    return available.reduce((best, current) => {
      const bestHealth = this.botHealth.get(best.botId);
      const currentHealth = this.botHealth.get(current.botId);

      if (!bestHealth) return current;
      if (!currentHealth) return best;

      return currentHealth.giftsAvailable > bestHealth.giftsAvailable ? current : best;
    });
  }

  /**
   * Update bot health from database
   * Calculates gifts from database records instead of using cached counters
   */
  async updateBotHealthFromDB(bot: Bot): Promise<void> {
    const health = this.botHealth.get(bot.id);

    if (health) {
      // Calculate gifts from database (single source of truth)
      const giftsToday = await calculateGiftsToday(bot.id);
      const giftsAvailable = await calculateGiftsAvailable(bot.id, bot.maxGiftsPerDay);

      health.status = bot.status;
      health.giftsAvailable = giftsAvailable;
      health.giftsToday = giftsToday;
      health.lastHeartbeat = bot.lastHeartbeat;
      health.uptime = bot.uptime;
      health.errorCount = bot.errorCount;
      health.isHealthy =
        bot.status === BotStatus.ONLINE && bot.isActive && giftsAvailable > 0;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): {
    total: number;
    online: number;
    offline: number;
    busy: number;
    error: number;
    totalGiftsAvailable: number;
  } {
    let online = 0;
    let offline = 0;
    let busy = 0;
    let error = 0;
    let totalGiftsAvailable = 0;

    for (const health of this.botHealth.values()) {
      totalGiftsAvailable += health.giftsAvailable;

      switch (health.status) {
        case 'ONLINE':
          online++;
          break;
        case 'OFFLINE':
          offline++;
          break;
        case 'BUSY':
          busy++;
          break;
        case 'ERROR':
          error++;
          break;
      }
    }

    return {
      total: this.bots.size,
      online,
      offline,
      busy,
      error,
      totalGiftsAvailable,
    };
  }

  /**
   * Set up event listeners for a bot
   */
  private setupBotListeners(botId: string, client: FortniteBotClient): void {
    client.on('ready', (data) => {
      log.bot.info(botId, 'Bot ready', data);
      this.updateBotStatus(botId, 'ONLINE');
    });

    client.on('disconnected', () => {
      log.bot.warn(botId, 'Bot disconnected');
      this.updateBotStatus(botId, 'OFFLINE');
    });

    client.on('error', (data: { error: string }) => {
      log.bot.error(botId, 'Bot error', data);
      this.incrementErrorCount(botId);
    });

    client.on('heartbeat', () => {
      this.updateLastHeartbeat(botId);
    });
  }

  /**
   * Update bot status in health tracking
   */
  private updateBotStatus(botId: string, status: string): void {
    const health = this.botHealth.get(botId);
    if (health) {
      health.status = status;
      health.isHealthy = status === 'ONLINE';
    }
  }

  /**
   * Update last heartbeat time
   */
  private updateLastHeartbeat(botId: string): void {
    const health = this.botHealth.get(botId);
    if (health) {
      health.lastHeartbeat = new Date();
    }
  }

  /**
   * Increment error count
   */
  private incrementErrorCount(botId: string): void {
    const health = this.botHealth.get(botId);
    if (health) {
      health.errorCount++;

      // Mark as unhealthy if too many errors
      if (health.errorCount > 5) {
        health.isHealthy = false;
        health.status = 'ERROR';
      }
    }
  }

  /**
   * Clear the pool
   */
  async clear(): Promise<void> {
    for (const [botId, client] of this.bots.entries()) {
      await client.logout();
    }

    this.bots.clear();
    this.botHealth.clear();

    log.info('Bot pool cleared');
  }
}
