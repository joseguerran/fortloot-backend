import { FortniteBotClient } from './FortniteBotClient';
import { BotPool } from './BotPool';
import { prisma } from '../database/client';
import { Bot, BotStatus, BotActivityType } from '@prisma/client';
import { log, registerBotName } from '../utils/logger';
import { config } from '../config';
import { BotConfig } from '../types';
import { BotOfflineError } from '../utils/errors';

/**
 * Manages multiple bot instances and their lifecycle
 */
export class BotManager {
  private pool: BotPool;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    this.pool = new BotPool();
  }

  /**
   * Log bot activity to database
   */
  private async logActivity(
    botId: string,
    type: BotActivityType,
    description: string,
    metadata?: any
  ): Promise<void> {
    try {
      await prisma.botActivity.create({
        data: {
          botId,
          type,
          description,
          metadata: metadata || null,
        },
      });
    } catch (error) {
      // Don't throw errors for activity logging failures
      log.error('Failed to log bot activity', { botId, type, error });
    }
  }

  /**
   * Start the bot manager
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('BotManager already running');
      return;
    }

    log.system.startup({ component: 'BotManager' });

    try {
      // Load bots from database
      await this.loadBots();

      // Start monitoring
      this.startMonitoring();

      this.isRunning = true;
      log.info('BotManager started successfully');
    } catch (error) {
      log.system.error('Failed to start BotManager', error);
      throw error;
    }
  }

  /**
   * Stop the bot manager
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    log.system.shutdown({ component: 'BotManager' });

    try {
      // Stop monitoring
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = null;
      }

      // Logout all bots
      await this.pool.clear();

      this.isRunning = false;
      log.info('BotManager stopped');
    } catch (error) {
      log.system.error('Error stopping BotManager', error);
      throw error;
    }
  }

  /**
   * Load bots from database and initialize them
   */
  private async loadBots(): Promise<void> {
    const bots = await prisma.bot.findMany({
      where: {
        isActive: true,
      },
    });

    log.info(`Loading ${bots.length} bots from database`);

    for (const bot of bots) {
      try {
        await this.initializeBot(bot);
      } catch (error) {
        log.error(`Failed to initialize bot ${bot.id}`, error);
        // Mark bot as error state in DB
        await prisma.bot.update({
          where: { id: bot.id },
          data: {
            status: BotStatus.ERROR,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            errorCount: { increment: 1 },
          },
        });
      }
    }

    const stats = this.pool.getPoolStats();
    log.info('Bot pool initialized', stats);
  }

  /**
   * Initialize a single bot
   */
  private async initializeBot(bot: Bot): Promise<void> {
    // Register bot name for readable logs
    registerBotName(bot.id, bot.displayName);

    log.bot.info(bot.id, 'Initializing bot', { name: bot.displayName });

    const botConfig: BotConfig = {
      name: bot.name,
      deviceAuth: {
        accountId: bot.accountId,
        deviceId: bot.deviceId,
        secret: bot.secret,
      },
      maxGiftsPerDay: bot.maxGiftsPerDay,
      priority: bot.priority,
    };

    const client = new FortniteBotClient(bot.id, botConfig);

    // Add to pool before logging in
    this.pool.addBot(bot.id, client);

    // Listen for friend:added events to save to database
    client.on('friend:added', async (data: any) => {
      try {
        const { epicAccountId, displayName } = data;

        // Check if friendship already exists
        const existing = await prisma.friendship.findUnique({
          where: {
            botId_epicAccountId: {
              botId: bot.id,
              epicAccountId,
            },
          },
        });

        if (!existing) {
          // Create friendship record
          const friendedAt = new Date();
          const canGiftAt = new Date(friendedAt.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now

          await prisma.friendship.create({
            data: {
              botId: bot.id,
              epicAccountId,
              displayName,
              status: 'ACCEPTED',
              friendedAt,
              canGiftAt,
            },
          });

          log.friendship.ready(bot.id, epicAccountId, {
            displayName,
            savedToDatabase: true
          });

          // Log activity
          await this.logActivity(
            bot.id,
            'FRIEND_ADDED',
            `Amigo agregado: ${displayName}`,
            { epicAccountId, displayName }
          );
        }
      } catch (error) {
        log.error('Failed to save friendship to database', {
          botId: bot.id,
          error
        });
      }
    });

    // Listen for other events and log activities
    client.on('friend:request', async (data: any) => {
      await this.logActivity(
        bot.id,
        'FRIEND_REQUEST_RECEIVED',
        `Solicitud de amistad recibida de: ${data.displayName}`,
        { epicAccountId: data.id, displayName: data.displayName }
      );
    });

    client.on('gift:sent', async (data: any) => {
      await this.logActivity(
        bot.id,
        'GIFT_SENT',
        `Regalo enviado a: ${data.recipientId}`,
        { recipientId: data.recipientId, itemId: data.itemId }
      );
    });

    client.on('friend:message', async (data: any) => {
      await this.logActivity(
        bot.id,
        'MESSAGE_RECEIVED',
        `Mensaje recibido de: ${data.from}`,
        { fromId: data.fromId, from: data.from, content: data.content }
      );
    });

    client.on('error', async (data: any) => {
      await this.logActivity(
        bot.id,
        'BOT_ERROR',
        `Error: ${data.error}`,
        { error: data.error }
      );
    });

    try {
      // Attempt login
      await client.login();

      // Get V-Bucks balance
      let vBucks = 0;
      try {
        vBucks = await client.getVBucks();
      } catch (error) {
        log.bot.warn(bot.id, 'Could not fetch V-Bucks balance', error);
      }

      // Update database
      await prisma.bot.update({
        where: { id: bot.id },
        data: {
          status: BotStatus.ONLINE,
          lastHeartbeat: new Date(),
          errorCount: 0,
          lastError: null,
          vBucks,
        },
      });

      log.bot.info(bot.id, 'Bot initialized successfully');

      // Log bot started activity
      await this.logActivity(
        bot.id,
        'BOT_STARTED',
        `Bot ${bot.displayName} iniciado exitosamente`,
        { vBucks }
      );

      // Auto-sync friends after successful login (with small delay to ensure bot is ready)
      setTimeout(async () => {
        log.bot.info(bot.id, '🔄 Starting automatic friend sync...');
        this.syncBotFriends(bot.id, client).catch((error) => {
          log.bot.error(bot.id, '❌ Auto-sync friends failed after login', error);
        });
      }, 2000); // Wait 2 seconds after login
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';

      // Check for invalid credentials (device auth expired/revoked)
      const isCredentialError =
        errorMessage.includes('invalid_refresh_token') ||
        errorMessage.includes('TOKEN_NOT_FOUND') ||
        errorMessage.includes('invalid_grant');

      if (isCredentialError) {
        log.bot.error(bot.id, '⚠️ Bot credentials are invalid, manual re-authentication required');
        await prisma.bot.update({
          where: { id: bot.id },
          data: {
            status: BotStatus.ERROR,
            lastError: 'CREDENTIALS_INVALID: Device auth needs re-authentication',
            errorCount: 999, // Prevent automatic restart attempts
          },
        });
        // Don't throw - allow other bots to initialize
        return;
      }

      // Check for STOMP 403 (rate-limited or blocked by Epic)
      const isStompError =
        errorMessage.includes('STOMP') && errorMessage.includes('403');

      if (isStompError) {
        log.bot.error(bot.id, '⚠️ STOMP 403 error - Epic Games may have rate-limited this bot');
        await prisma.bot.update({
          where: { id: bot.id },
          data: {
            status: BotStatus.ERROR,
            lastError: 'RATE_LIMITED: Epic Games connection blocked (STOMP 403)',
            errorCount: { increment: 1 },
          },
        });

        // Exponential backoff: retry after 5 minutes * errorCount
        const retryDelay = Math.min(5 * 60 * 1000 * (bot.errorCount + 1), 30 * 60 * 1000);
        log.bot.warn(bot.id, `Will retry in ${retryDelay / 60000} minutes`);
        setTimeout(() => this.restartBot(bot.id), retryDelay);
        return;
      }

      // For other errors, throw to let the caller handle it
      log.bot.error(bot.id, 'Failed to login', error);
      throw error;
    }
  }

  /**
   * Add a new bot to the system
   */
  async addBot(botConfig: BotConfig & { deviceAuth: { deviceId: string; accountId: string; secret: string } }): Promise<Bot> {
    log.info('Adding new bot to system', { name: botConfig.name });

    try {
      // Create temporary client to get account info
      const tempClient = new FortniteBotClient('temp', botConfig);
      await tempClient.login();

      const status = tempClient.getStatus();

      await tempClient.logout();

      // Create in database with full credentials
      const bot = await prisma.bot.create({
        data: {
          name: botConfig.name,
          status: BotStatus.OFFLINE,
          epicAccountId: status.accountId!,
          displayName: status.displayName!,
          deviceId: botConfig.deviceAuth.deviceId,
          accountId: botConfig.deviceAuth.accountId,
          secret: botConfig.deviceAuth.secret,
          maxGiftsPerDay: botConfig.maxGiftsPerDay || config.bot.maxGiftsPerDay,
          giftsAvailable: botConfig.maxGiftsPerDay || config.bot.maxGiftsPerDay,
          priority: botConfig.priority || 0,
          isActive: true,
        },
      });

      // Initialize the bot
      await this.initializeBot(bot);

      log.info('Bot added successfully', { botId: bot.id, name: bot.name });

      return bot;
    } catch (error) {
      log.error('Failed to add bot', error);
      throw error;
    }
  }

  /**
   * Remove a bot from the system
   */
  async removeBot(botId: string): Promise<void> {
    log.info('Removing bot', { botId });

    try {
      // Remove from pool
      await this.pool.removeBot(botId);

      // Mark as inactive in database
      await prisma.bot.update({
        where: { id: botId },
        data: {
          isActive: false,
          status: BotStatus.OFFLINE,
        },
      });

      log.info('Bot removed', { botId });
    } catch (error) {
      log.error('Failed to remove bot', error);
      throw error;
    }
  }

  /**
   * Get a bot by ID
   */
  getBot(botId: string): FortniteBotClient {
    const bot = this.pool.getBot(botId);
    if (!bot) {
      throw new BotOfflineError(botId);
    }
    return bot;
  }

  /**
   * Get an available bot for sending gifts
   */
  async getAvailableBot(): Promise<{ botId: string; bot: FortniteBotClient } | null> {
    const result = this.pool.getBotWithMostGifts();

    if (!result) {
      log.warn('No available bots found');
      return null;
    }

    return { botId: result.botId, bot: result.client };
  }


  /**
   * Get pool statistics
   */
  getPoolStats() {
    return this.pool.getPoolStats();
  }

  /**
   * Manually login a bot
   * Useful when a bot was stopped or failed to connect
   */
  async loginBot(botId: string): Promise<void> {
    log.info('Manual login requested', { botId });

    const bot = await prisma.bot.findUnique({ where: { id: botId } });

    if (!bot) {
      throw new Error(`Bot ${botId} not found`);
    }

    if (!bot.isActive) {
      throw new Error(`Bot ${botId} is not active`);
    }

    // Check if already logged in
    const existingClient = this.pool.getBot(botId);
    if (existingClient && existingClient.isReady()) {
      log.info('Bot already logged in', { botId });
      return;
    }

    // Initialize/reinitialize the bot
    await this.initializeBot(bot);

    log.info('Bot logged in successfully', { botId });
  }

  /**
   * Manually logout a bot
   * Stops the bot without removing from database
   */
  async logoutBot(botId: string): Promise<void> {
    log.info('Manual logout requested', { botId });

    const bot = await prisma.bot.findUnique({ where: { id: botId } });

    if (!bot) {
      throw new Error(`Bot ${botId} not found`);
    }

    // Remove from pool (this calls logout on the client)
    await this.pool.removeBot(botId);

    // Update database status
    await prisma.bot.update({
      where: { id: botId },
      data: {
        status: BotStatus.OFFLINE,
      },
    });

    log.info('Bot logged out successfully', { botId });
  }

  /**
   * Manually restart a bot (public version)
   * Logout and login again
   */
  async restartBotManual(botId: string): Promise<void> {
    log.info('Manual restart requested', { botId });

    const bot = await prisma.bot.findUnique({ where: { id: botId } });

    if (!bot) {
      throw new Error(`Bot ${botId} not found`);
    }

    if (!bot.isActive) {
      throw new Error(`Bot ${botId} is not active`);
    }

    await this.restartBot(botId);

    log.info('Bot restarted successfully', { botId });
  }

  /**
   * Update bot credentials with new device auth
   */
  async updateBotCredentials(
    botId: string,
    deviceAuth: { deviceId: string; accountId: string; secret: string }
  ): Promise<void> {
    log.info('Updating bot credentials', { botId });

    const bot = await prisma.bot.findUnique({ where: { id: botId } });

    if (!bot) {
      throw new Error(`Bot ${botId} not found`);
    }

    try {
      // Logout current session if active
      const existingClient = this.pool.getBot(botId);
      if (existingClient) {
        await this.pool.removeBot(botId);
      }

      // Create temporary client with new device auth to verify and get account info
      const tempConfig: BotConfig & { deviceAuth: typeof deviceAuth } = {
        name: bot.name,
        deviceAuth,
        maxGiftsPerDay: bot.maxGiftsPerDay,
        priority: bot.priority,
      };

      const tempClient = new FortniteBotClient('temp-update', tempConfig);
      await tempClient.login();

      const status = tempClient.getStatus();

      await tempClient.logout();

      // Update database with new credentials
      await prisma.bot.update({
        where: { id: botId },
        data: {
          deviceId: deviceAuth.deviceId,
          accountId: deviceAuth.accountId,
          secret: deviceAuth.secret,
          epicAccountId: status.accountId || bot.epicAccountId,
          displayName: status.displayName || bot.displayName,
          status: BotStatus.OFFLINE,
          errorCount: 0,
          lastError: null,
        },
      });

      log.info('Bot credentials updated successfully', { botId });

      // If bot was active, reinitialize it
      if (bot.isActive) {
        const updatedBot = await prisma.bot.findUnique({ where: { id: botId } });
        if (updatedBot) {
          await this.initializeBot(updatedBot);
        }
      }
    } catch (error) {
      log.error('Failed to update bot credentials', { botId, error });
      throw new Error(
        `Failed to update credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Start monitoring bot health and gift resets
   */
  private startMonitoring(): void {
    this.checkInterval = setInterval(async () => {
      await this.monitorBots();
    }, config.bot.checkInterval);

    log.info('Bot monitoring started', {
      interval: config.bot.checkInterval,
    });
  }

  /**
   * Monitor bot health
   */
  private async monitorBots(): Promise<void> {
    try {
      const bots = await prisma.bot.findMany({
        where: { isActive: true },
      });

      for (const bot of bots) {
        // Update pool health (now async - queries Gift table)
        await this.pool.updateBotHealthFromDB(bot);

        // Check bot heartbeat
        const health = this.pool.getBotHealth(bot.id);
        if (health) {
          const minutesSinceHeartbeat =
            (Date.now() - health.lastHeartbeat.getTime()) / 1000 / 60;

          // If no heartbeat for 5 minutes, try to restart
          if (minutesSinceHeartbeat > 5) {
            log.bot.warn(bot.id, 'Bot appears unresponsive, attempting restart');
            await this.restartBot(bot.id);
          }
        }

        // Update V-Bucks balance periodically (every hour or if never updated)
        const hoursSinceLastUpdate = bot.lastHeartbeat
          ? (Date.now() - bot.lastHeartbeat.getTime()) / 1000 / 60 / 60
          : 999;

        if (hoursSinceLastUpdate >= 1 && bot.status === 'ONLINE') {
          await this.updateVBucksBalance(bot.id);
        }
      }
    } catch (error) {
      log.error('Error monitoring bots', error);
    }
  }


  /**
   * Update V-Bucks balance for a bot
   */
  private async updateVBucksBalance(botId: string): Promise<void> {
    try {
      const client = this.pool.getBot(botId);

      if (!client) {
        log.bot.warn(botId, 'Cannot update V-Bucks - bot not found in pool');
        return;
      }

      const vBucks = await client.getVBucks();
      const previousBalance = await prisma.bot.findUnique({
        where: { id: botId },
        select: { vBucks: true },
      });

      await prisma.bot.update({
        where: { id: botId },
        data: { vBucks },
      });

      // Log activity if balance changed
      if (previousBalance && previousBalance.vBucks !== vBucks) {
        await prisma.botActivity.create({
          data: {
            botId,
            type: 'VBUCKS_UPDATED',
            description: `V-Bucks balance updated from ${previousBalance.vBucks} to ${vBucks}`,
            metadata: {
              previousBalance: previousBalance.vBucks,
              newBalance: vBucks,
              change: vBucks - previousBalance.vBucks,
            },
          },
        });

        log.bot.info(botId, 'V-Bucks balance updated', {
          previousBalance: previousBalance.vBucks,
          newBalance: vBucks,
          change: vBucks - previousBalance.vBucks,
        });
      }
    } catch (error) {
      log.bot.error(botId, 'Failed to update V-Bucks balance', error);
    }
  }

  /**
   * Sync friends from Epic Games API to database
   */
  private async syncBotFriends(botId: string, client: FortniteBotClient): Promise<void> {
    try {
      log.bot.info(botId, 'Auto-syncing friends from Epic Games');

      // Get friends from Epic Games
      const epicFriends = await client.getFriends();

      log.bot.info(botId, `Found ${epicFriends.length} friends in Epic Games`);

      let newFriendsAdded = 0;

      // Check each friend and add to database if not exists
      for (const epicFriend of epicFriends) {
        const existing = await prisma.friendship.findUnique({
          where: {
            botId_epicAccountId: {
              botId,
              epicAccountId: epicFriend.accountId,
            },
          },
        });

        if (!existing) {
          // Create friendship record
          const friendedAt = new Date();
          const canGiftAt = new Date(friendedAt.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now

          await prisma.friendship.create({
            data: {
              botId,
              epicAccountId: epicFriend.accountId,
              displayName: epicFriend.displayName,
              status: 'ACCEPTED',
              friendedAt,
              canGiftAt,
            },
          });

          newFriendsAdded++;
          log.friendship.ready(botId, epicFriend.accountId, {
            displayName: epicFriend.displayName,
            savedToDatabase: true
          });
        }
      }

      log.bot.info(botId, `Auto-sync complete: ${newFriendsAdded} new friends added`);

      // Log sync activity
      await this.logActivity(
        botId,
        'FRIENDS_SYNCED',
        `Sincronización de amigos completada: ${newFriendsAdded} nuevos amigos`,
        { totalInEpic: epicFriends.length, newFriendsAdded, alreadyInDatabase: epicFriends.length - newFriendsAdded }
      );
    } catch (error) {
      log.bot.error(botId, 'Failed to auto-sync friends', error);
      // Don't throw, just log the error to prevent blocking bot startup
    }
  }

  /**
   * Restart a bot
   */
  private async restartBot(botId: string): Promise<void> {
    try {
      log.bot.info(botId, 'Restarting bot');

      // Remove from pool
      await this.pool.removeBot(botId);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, config.bot.restartDelay));

      // Reload from database
      const bot = await prisma.bot.findUnique({ where: { id: botId } });

      if (bot && bot.isActive) {
        await this.initializeBot(bot);
      }
    } catch (error) {
      log.bot.error(botId, 'Failed to restart bot', error);
    }
  }

  /**
   * Get all active bot clients
   */
  getActiveBots(): FortniteBotClient[] {
    return this.pool.getAllBots();
  }
}

// Export singleton instance
export const botManager = new BotManager();
