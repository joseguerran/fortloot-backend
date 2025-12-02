import { Request, Response } from 'express';
import { prisma } from '../../database/client';
import { botManager } from '../../bots/BotManager';
import { log } from '../../utils/logger';
import { BotAvailability } from '../../types';
import {
  sanitizeBotData,
  sanitizeBotArray,
  sanitizeBotDataForAdmin,
  extractBotCredentials,
} from '../../utils/sanitize';
import { calculateGiftsToday, calculateGiftsAvailable } from '../../utils/helpers';

export class BotController {
  /**
   * Get bot availability information
   */
  static async getAvailability(req: Request, res: Response) {
    const stats = botManager.getPoolStats();

    const bots = await prisma.bot.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        status: true,
        maxGiftsPerDay: true,
      },
    });

    // Calculate real-time gift data for each bot
    const botsWithGiftData = await Promise.all(
      bots.map(async (bot) => {
        const giftsToday = await calculateGiftsToday(bot.id);
        const giftsAvailable = await calculateGiftsAvailable(bot.id, bot.maxGiftsPerDay);

        return {
          id: bot.id,
          name: bot.name,
          status: bot.status,
          giftsAvailable,
          giftsToday,
        };
      })
    );

    // Calculate estimated wait time
    const totalGiftsAvailable = stats.totalGiftsAvailable;
    const queueStats = await require('../../queue/QueueManager').queueManager.getQueueStats('gift');
    const queueLength = queueStats.waiting + queueStats.active;

    const avgProcessingTime = 5; // minutes per gift
    const estimatedWaitTimeMinutes = totalGiftsAvailable > 0
      ? (queueLength / stats.online) * avgProcessingTime
      : 999999;

    const nextAvailableSlot = new Date(Date.now() + estimatedWaitTimeMinutes * 60 * 1000);

    const availability: BotAvailability = {
      totalBots: stats.total,
      onlineBots: stats.online,
      availableGifts: totalGiftsAvailable,
      estimatedWaitTime: Math.ceil(estimatedWaitTimeMinutes / 60), // hours
      nextAvailableSlot,
    };

    res.json({
      success: true,
      data: {
        availability,
        bots: botsWithGiftData,
      },
    });
  }

  /**
   * Get all bots
   */
  static async getAllBots(req: Request, res: Response) {
    const bots = await prisma.bot.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const poolStats = botManager.getPoolStats();

    // Calculate real-time gift data and verify bot status from botManager
    const botsWithGiftData = await Promise.all(
      bots.map(async (bot) => {
        const giftsToday = await calculateGiftsToday(bot.id);
        const giftsAvailable = await calculateGiftsAvailable(bot.id, bot.maxGiftsPerDay);

        // Check real-time status from botManager
        let realTimeStatus = bot.status;
        const botClient = botManager.getBot(bot.id);

        if (botClient) {
          const isOnline = botClient.isReady();
          if (isOnline && bot.status !== 'ONLINE') {
            realTimeStatus = 'ONLINE';
          } else if (!isOnline && bot.status === 'ONLINE') {
            realTimeStatus = 'OFFLINE';
          }
        } else if (bot.status === 'ONLINE') {
          realTimeStatus = 'OFFLINE';
        }

        return {
          ...bot,
          status: realTimeStatus,
          giftsToday,
          giftsAvailable,
        };
      })
    );

    // Sanitize bot data to remove credentials
    const sanitizedBots = sanitizeBotArray(botsWithGiftData);

    res.json({
      success: true,
      data: {
        bots: sanitizedBots,
        stats: poolStats,
      },
    });
  }

  /**
   * Get bot by ID
   */
  static async getBot(req: Request, res: Response) {
    const { botId } = req.params;

    const bot = await prisma.bot.findUnique({
      where: { id: botId },
      include: {
        friendships: {
          where: { status: 'ACCEPTED' },
          take: 10,
          orderBy: { friendedAt: 'desc' },
        },
        gifts: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
        metrics: {
          take: 7,
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'BOT_NOT_FOUND',
        message: 'Bot not found',
      });
    }

    // Check real-time bot status from botManager
    let realTimeStatus = bot.status;
    const botClient = botManager.getBot(botId);

    if (botClient) {
      // Bot exists in memory - check if it's actually ready
      const isOnline = botClient.isReady();
      if (isOnline && bot.status !== 'ONLINE') {
        realTimeStatus = 'ONLINE';
        // Update DB if status is wrong
        await prisma.bot.update({
          where: { id: botId },
          data: { status: 'ONLINE' },
        });
      } else if (!isOnline && bot.status === 'ONLINE') {
        realTimeStatus = 'OFFLINE';
        // Update DB if status is wrong
        await prisma.bot.update({
          where: { id: botId },
          data: { status: 'OFFLINE' },
        });
      }
    } else {
      // Bot doesn't exist in memory - it's offline
      if (bot.status === 'ONLINE') {
        realTimeStatus = 'OFFLINE';
        // Update DB if status is wrong
        await prisma.bot.update({
          where: { id: botId },
          data: { status: 'OFFLINE' },
        });
      }
    }

    // Calculate real-time gift data from Gift table
    const giftsToday = await calculateGiftsToday(bot.id);
    const giftsAvailable = await calculateGiftsAvailable(bot.id, bot.maxGiftsPerDay);

    const botWithGiftData = {
      ...bot,
      status: realTimeStatus,
      giftsToday,
      giftsAvailable,
    };

    // Sanitize bot data
    const sanitizedBot = sanitizeBotData(botWithGiftData);

    res.json({
      success: true,
      data: sanitizedBot,
    });
  }

  /**
   * Add a new bot
   */
  static async addBot(req: Request, res: Response) {
    const { name, displayName, deviceId, accountId, secret, maxGiftsPerDay, priority } = req.body;

    // Validate required fields
    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: 'Name and displayName are required',
      });
    }

    if (!deviceId || !accountId || !secret) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DEVICE_AUTH',
        message: 'Device auth credentials (deviceId, accountId, secret) are required',
      });
    }

    log.info('Adding new bot', { name });

    try {
      const bot = await botManager.addBot({
        name,
        deviceAuth: {
          deviceId,
          accountId,
          secret,
        },
        maxGiftsPerDay: maxGiftsPerDay || 5,
        priority: priority || 0,
      });

      // Sanitize response
      const sanitizedBot = sanitizeBotData(bot);

      res.status(201).json({
        success: true,
        data: sanitizedBot,
        message: 'Bot added successfully',
      });
    } catch (error) {
      log.error('Failed to add bot', error);
      throw error;
    }
  }

  /**
   * Update bot settings
   */
  static async updateBot(req: Request, res: Response) {
    const { botId } = req.params;
    const { isActive, maxGiftsPerDay, priority } = req.body;

    const bot = await prisma.bot.update({
      where: { id: botId },
      data: {
        isActive,
        maxGiftsPerDay,
        priority,
      },
    });

    log.info('Bot updated', { botId, updates: req.body });

    res.json({
      success: true,
      data: bot,
      message: 'Bot updated successfully',
    });
  }

  /**
   * Remove/deactivate a bot
   */
  static async removeBot(req: Request, res: Response) {
    const { botId } = req.params;

    await botManager.removeBot(botId);

    res.json({
      success: true,
      message: 'Bot removed successfully',
    });
  }

  /**
   * Send a test message to a friend (for debugging)
   */
  static async sendTestMessage(req: Request, res: Response) {
    const { botId } = req.params;
    const { epicId, message } = req.body;

    if (!epicId || !message) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'epicId and message are required',
      });
    }

    try {
      const botClient = botManager.getBot(botId);

      if (!botClient) {
        return res.status(404).json({
          success: false,
          error: 'BOT_NOT_FOUND',
          message: 'Bot not found or offline',
        });
      }

      await botClient.sendTestMessage(epicId, message);

      res.json({
        success: true,
        message: 'Test message sent successfully',
        data: {
          botId,
          epicId,
          message,
        },
      });
    } catch (error: any) {
      log.error('Failed to send test message:', error);

      res.status(500).json({
        success: false,
        error: 'TEST_MESSAGE_FAILED',
        message: error.message || 'Failed to send test message',
      });
    }
  }

  /**
   * Send a gift with full validation
   * Validates recipient, resolves item ID to offer ID, and checks giftability
   * This is the production-ready gift sending method
   */
  static async sendGiftWithValidation(req: Request, res: Response) {
    const { botId } = req.params;
    const { recipientEpicId, offerId, message } = req.body;

    if (!recipientEpicId || !offerId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'recipientEpicId and offerId are required',
      });
    }

    try {
      const botClient = botManager.getBot(botId);

      if (!botClient) {
        return res.status(404).json({
          success: false,
          error: 'BOT_NOT_FOUND',
          message: 'Bot not found or offline',
        });
      }

      // Check if recipientEpicId is a display name (username) or account ID
      // Account IDs are 32 character hex strings, display names are typically shorter and alphanumeric
      let accountId = recipientEpicId;
      let displayName = recipientEpicId;

      // If it doesn't look like an account ID (32 char hex), try to look it up
      if (!/^[a-f0-9]{32}$/i.test(recipientEpicId)) {
        log.info('Recipient appears to be a display name, looking up account ID', {
          recipientEpicId,
        });

        const lookedUpAccountId = await botClient.lookupByDisplayName(recipientEpicId);

        if (!lookedUpAccountId) {
          return res.status(404).json({
            success: false,
            error: 'ACCOUNT_NOT_FOUND',
            message: `Epic Games account not found for display name: ${recipientEpicId}`,
          });
        }

        accountId = lookedUpAccountId;
        log.info('Account ID found for display name', {
          displayName: recipientEpicId,
          accountId,
        });
      }

      // Auto-resolve offer ID using catalog search
      let resolvedOfferId = offerId;
      let itemSearchInfo = null;

      log.info('Attempting to resolve offer ID', { originalOfferId: offerId });

      // Use non-strict search (allows partial matches)
      const searchResult = await botClient.searchCatalogItem(offerId, false);

      if (searchResult.found && searchResult.item) {
        resolvedOfferId = searchResult.item.offerId;
        itemSearchInfo = {
          query: offerId,
          exactMatch: searchResult.exactMatch,
          resolvedItem: {
            name: searchResult.item.name,
            offerId: searchResult.item.offerId,
            itemId: searchResult.item.itemId,
            price: searchResult.item.price,
            giftable: searchResult.item.giftable,
          },
          suggestions: searchResult.suggestions?.map(s => ({
            name: s.name,
            offerId: s.offerId,
            itemId: s.itemId,
          })),
        };

        if (!searchResult.item.giftable) {
          return res.status(400).json({
            success: false,
            error: 'ITEM_NOT_GIFTABLE',
            message: `Item "${searchResult.item.name}" is not giftable`,
            data: itemSearchInfo,
          });
        }

        if (!searchResult.exactMatch) {
          log.info('Using partial match for item', {
            query: offerId,
            resolvedName: searchResult.item.name,
            resolvedOfferId: resolvedOfferId,
          });
        }
      } else {
        return res.status(404).json({
          success: false,
          error: 'ITEM_NOT_FOUND',
          message: `Item "${offerId}" not found in current Fortnite catalog`,
        });
      }

      const result = await botClient.sendGift(accountId, resolvedOfferId, searchResult.item.price);

      // Note: Gift tracking is now automatic via Gift table queries
      // No need to manually decrement counters

      res.json({
        success: true,
        message: 'Gift sent successfully',
        data: {
          botId,
          recipientDisplayName: displayName,
          recipientAccountId: accountId,
          offerId: resolvedOfferId,
          originalQuery: offerId !== resolvedOfferId ? offerId : undefined,
          giftBoxItemId: result,
          itemInfo: itemSearchInfo,
        },
      });
    } catch (error: any) {
      log.error('Failed to send gift:', error);

      res.status(500).json({
        success: false,
        error: 'GIFT_SEND_FAILED',
        message: error.message || 'Failed to send gift',
      });
    }
  }

  /**
   * Get bot health
   */
  static async getBotHealth(req: Request, res: Response) {
    const { botId } = req.params;

    const bot = await prisma.bot.findUnique({
      where: { id: botId },
    });

    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'BOT_NOT_FOUND',
        message: 'Bot not found',
      });
    }

    const health = {
      botId: bot.id,
      name: bot.name,
      status: bot.status,
      isHealthy: bot.status === 'ONLINE' && bot.isActive && bot.errorCount < 5,
      giftsAvailable: bot.giftsAvailable,
      giftsToday: bot.giftsToday,
      lastHeartbeat: bot.lastHeartbeat,
      uptime: bot.uptime,
      errorCount: bot.errorCount,
      lastError: bot.lastError,
    };

    res.json({
      success: true,
      data: health,
    });
  }

  /**
   * Manually login a bot
   */
  static async loginBot(req: Request, res: Response) {
    const { botId } = req.params;

    try {
      await botManager.loginBot(botId);

      res.json({
        success: true,
        message: 'Bot logged in successfully',
      });
    } catch (error) {
      log.error('Failed to login bot', { botId, error });

      return res.status(400).json({
        success: false,
        error: 'LOGIN_FAILED',
        message: error instanceof Error ? error.message : 'Failed to login bot',
      });
    }
  }

  /**
   * Manually logout a bot
   */
  static async logoutBot(req: Request, res: Response) {
    const { botId } = req.params;

    try {
      await botManager.logoutBot(botId);

      res.json({
        success: true,
        message: 'Bot logged out successfully',
      });
    } catch (error) {
      log.error('Failed to logout bot', { botId, error });

      return res.status(400).json({
        success: false,
        error: 'LOGOUT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to logout bot',
      });
    }
  }

  /**
   * Manually restart a bot
   */
  static async restartBot(req: Request, res: Response) {
    const { botId } = req.params;

    try {
      await botManager.restartBotManual(botId);

      res.json({
        success: true,
        message: 'Bot restarted successfully',
      });
    } catch (error) {
      log.error('Failed to restart bot', { botId, error });

      return res.status(400).json({
        success: false,
        error: 'RESTART_FAILED',
        message: error instanceof Error ? error.message : 'Failed to restart bot',
      });
    }
  }

  /**
   * Update bot credentials with new device auth
   */
  static async updateCredentials(req: Request, res: Response) {
    const { botId } = req.params;
    const { deviceId, accountId, secret } = req.body;

    if (!deviceId || !accountId || !secret) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DEVICE_AUTH',
        message: 'Device auth credentials (deviceId, accountId, secret) are required',
      });
    }

    try {
      await botManager.updateBotCredentials(botId, {
        deviceId,
        accountId,
        secret,
      });

      res.json({
        success: true,
        message: 'Bot credentials updated successfully',
      });
    } catch (error) {
      log.error('Failed to update bot credentials', { botId, error });

      return res.status(400).json({
        success: false,
        error: 'UPDATE_CREDENTIALS_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update credentials',
      });
    }
  }

  /**
   * Sync friends from Epic Games API to database
   */
  static async syncBotFriends(req: Request, res: Response) {
    const { botId } = req.params;

    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'BOT_NOT_FOUND',
          message: 'Bot not found',
        });
      }

      // Get bot client
      let liveFriends: Array<{ accountId: string; displayName: string }> = [];
      try {
        const botClient = botManager.getBot(botId);
        if (botClient && botClient.isReady()) {
          liveFriends = await botClient.getFriends();
        } else {
          return res.status(400).json({
            success: false,
            error: 'BOT_OFFLINE',
            message: 'Bot is not online. Cannot sync friends.',
          });
        }
      } catch (error) {
        log.error('Could not get bot client for sync', { botId, error });
        return res.status(500).json({
          success: false,
          error: 'INTERNAL_ERROR',
          message: 'Could not access bot client',
        });
      }

      // Get existing friendships from database
      const existingFriendships = await prisma.friendship.findMany({
        where: { botId },
      });

      // Create maps for easier lookup
      const existingByEpicId = new Map(existingFriendships.map(f => [f.epicAccountId, f]));
      const existingByDisplayName = new Map(existingFriendships.map(f => [f.displayName?.toLowerCase(), f]));
      const liveEpicIds = new Set(liveFriends.map(f => f.accountId));
      const liveDisplayNames = new Map(liveFriends.map(f => [f.displayName?.toLowerCase(), f]));

      // Find friends that are not in database (new friends)
      // Check both by epicAccountId AND by displayName to avoid duplicates
      const newFriends = liveFriends.filter(f => {
        const hasMatchByEpicId = existingByEpicId.has(f.accountId);
        const hasMatchByDisplayName = existingByDisplayName.has(f.displayName?.toLowerCase());
        return !hasMatchByEpicId && !hasMatchByDisplayName;
      });

      // Find pending friendships that are now accepted in Epic
      // Match by epicAccountId OR by displayName (to handle cases where displayName was stored as epicAccountId)
      const pendingToAccept: Array<{ friendship: typeof existingFriendships[0]; epicFriend: typeof liveFriends[0] | null }> = [];
      for (const friendship of existingFriendships) {
        if (friendship.status !== 'PENDING') continue;

        // Try to find the corresponding Epic friend
        let epicFriend: typeof liveFriends[0] | null = null;

        // First, try to match by epicAccountId
        const matchByEpicId = liveFriends.find(f => f.accountId === friendship.epicAccountId);
        if (matchByEpicId) {
          epicFriend = matchByEpicId;
        } else {
          // If not found by epicAccountId, try to match by displayName
          // This handles cases where displayName was incorrectly stored as epicAccountId
          const matchByDisplayName = liveDisplayNames.get(friendship.epicAccountId?.toLowerCase()) ||
                                      liveDisplayNames.get(friendship.displayName?.toLowerCase());
          if (matchByDisplayName) {
            epicFriend = matchByDisplayName;
          }
        }

        if (epicFriend) {
          pendingToAccept.push({ friendship, epicFriend });
        }
      }

      // Find friendships in DB that are no longer in Epic (removed)
      // Be careful not to mark as removed if we just haven't matched correctly
      const removedFriends = existingFriendships.filter(f => {
        if (f.status === 'REMOVED') return false;

        // Check if friend exists in Epic by epicAccountId
        if (liveEpicIds.has(f.epicAccountId)) return false;

        // Also check by displayName to avoid false positives
        const matchByDisplayName = liveDisplayNames.get(f.displayName?.toLowerCase());
        if (matchByDisplayName) return false;

        return true;
      });

      // Add new friends to database
      let addedCount = 0;
      for (const friend of newFriends) {
        try {
          const friendedAt = new Date();
          const canGiftAt = new Date(friendedAt.getTime() + 48 * 60 * 60 * 1000); // 48 hours

          await prisma.friendship.create({
            data: {
              botId,
              epicAccountId: friend.accountId,
              displayName: friend.displayName,
              status: 'ACCEPTED',
              friendedAt,
              canGiftAt,
            },
          });

          addedCount++;
          log.info('Friend synced to database', {
            botId,
            epicAccountId: friend.accountId,
            displayName: friend.displayName,
          });
        } catch (error) {
          log.error('Failed to sync friend', {
            botId,
            epicAccountId: friend.accountId,
            error,
          });
        }
      }

      // Update pending friendships to accepted (user accepted friend request)
      let acceptedCount = 0;
      for (const { friendship, epicFriend } of pendingToAccept) {
        try {
          const now = new Date();
          // Use existing friendedAt if available, otherwise use now
          const friendedAt = friendship.friendedAt || now;
          const canGiftAt = new Date(friendedAt.getTime() + 48 * 60 * 60 * 1000);

          // Build update data - always update status, and fix epicAccountId if needed
          const updateData: any = {
            status: 'ACCEPTED',
            friendedAt,
            canGiftAt,
          };

          // If the epicAccountId was stored incorrectly (e.g., displayName instead of real ID),
          // update it to the correct value from Epic
          if (epicFriend && epicFriend.accountId !== friendship.epicAccountId) {
            updateData.epicAccountId = epicFriend.accountId;
            updateData.displayName = epicFriend.displayName; // Also update displayName in case it changed
            log.info('Correcting epicAccountId for friendship', {
              botId,
              oldEpicAccountId: friendship.epicAccountId,
              newEpicAccountId: epicFriend.accountId,
              displayName: epicFriend.displayName,
            });
          }

          await prisma.friendship.update({
            where: { id: friendship.id },
            data: updateData,
          });

          acceptedCount++;
          log.info('Friendship updated to ACCEPTED', {
            botId,
            epicAccountId: epicFriend?.accountId || friendship.epicAccountId,
            displayName: epicFriend?.displayName || friendship.displayName,
          });
        } catch (error) {
          log.error('Failed to update friendship status', {
            botId,
            friendshipId: friendship.id,
            error,
          });
        }
      }

      // Mark removed friends (optional - only if they were previously accepted)
      let removedCount = 0;
      for (const friendship of removedFriends) {
        // Only mark as removed if it was previously accepted (ignore pending that weren't accepted)
        if (friendship.status === 'ACCEPTED') {
          try {
            await prisma.friendship.update({
              where: { id: friendship.id },
              data: { status: 'REMOVED' },
            });

            removedCount++;
            log.info('Friendship marked as REMOVED', {
              botId,
              epicAccountId: friendship.epicAccountId,
              displayName: friendship.displayName,
            });
          } catch (error) {
            log.error('Failed to mark friendship as removed', {
              botId,
              friendshipId: friendship.id,
              error,
            });
          }
        }
      }

      res.json({
        success: true,
        data: {
          totalInEpic: liveFriends.length,
          alreadyInDatabase: existingFriendships.length,
          newFriendsAdded: addedCount,
          pendingAccepted: acceptedCount,
          markedAsRemoved: removedCount,
        },
        message: `Synced: ${addedCount} new, ${acceptedCount} accepted, ${removedCount} removed`,
      });
    } catch (error) {
      log.error('Failed to sync bot friends', { botId, error });

      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to sync friends',
      });
    }
  }

  /**
   * Get bot friends list
   * Combines database friendships with live Epic Games API data
   */
  static async getBotFriends(req: Request, res: Response) {
    const { botId } = req.params;

    try {
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'BOT_NOT_FOUND',
          message: 'Bot not found',
        });
      }

      // Get friendships from database
      const dbFriendships = await prisma.friendship.findMany({
        where: { botId },
        orderBy: { friendedAt: 'desc' },
      });

      // Try to get live friends from Epic Games API
      let liveFriends: Array<{ accountId: string; displayName: string }> = [];
      try {
        const botClient = botManager.getBot(botId);
        if (botClient && botClient.isReady()) {
          liveFriends = await botClient.getFriends();
        }
      } catch (error) {
        log.warn('Could not fetch live friends from Epic API', { botId, error });
        // Continue with database data only
      }

      // Merge database friendships with live data
      const friendsMap = new Map();

      // Add database friendships
      for (const friendship of dbFriendships) {
        friendsMap.set(friendship.epicAccountId, {
          epicAccountId: friendship.epicAccountId,
          displayName: friendship.displayName,
          status: friendship.status,
          friendedAt: friendship.friendedAt,
          canGiftAt: friendship.canGiftAt,
          isLive: false,
        });
      }

      // Update with live data from Epic
      for (const liveFriend of liveFriends) {
        const existing = friendsMap.get(liveFriend.accountId);
        if (existing) {
          // Update existing entry with live status
          existing.isLive = true;
          existing.displayName = liveFriend.displayName; // Update display name
        } else {
          // Found a friend not in database (shouldn't happen often)
          friendsMap.set(liveFriend.accountId, {
            epicAccountId: liveFriend.accountId,
            displayName: liveFriend.displayName,
            status: 'ACCEPTED', // They're in Epic's friend list
            friendedAt: new Date(),
            canGiftAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
            isLive: true,
          });
        }
      }

      const friends = Array.from(friendsMap.values());

      res.json({
        success: true,
        data: {
          friends,
          total: friends.length,
          onlineInEpic: liveFriends.length,
        },
      });
    } catch (error) {
      log.error('Failed to get bot friends', { botId, error });

      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get bot friends',
      });
    }
  }

  /**
   * Get V-Bucks balance in real-time from Epic Games
   */
  static async getVBucksBalance(req: Request, res: Response) {
    const { botId } = req.params;

    try {
      const botClient = botManager.getBot(botId);

      if (!botClient) {
        return res.status(404).json({
          success: false,
          error: 'BOT_NOT_FOUND',
          message: 'Bot not found or offline',
        });
      }

      if (!botClient.isReady()) {
        return res.status(400).json({
          success: false,
          error: 'BOT_OFFLINE',
          message: 'Bot is not online. Cannot query V-Bucks.',
        });
      }

      const vbucks = await botClient.getVBucks();

      // Update database with new balance
      await prisma.bot.update({
        where: { id: botId },
        data: { vBucks: vbucks },
      });

      log.info('V-Bucks balance refreshed', { botId, vbucks });

      res.json({
        success: true,
        data: { botId, vbucks },
      });
    } catch (error: any) {
      log.error('Failed to get V-Bucks balance:', error);

      res.status(500).json({
        success: false,
        error: 'VBUCKS_FETCH_FAILED',
        message: error.message || 'Failed to fetch V-Bucks balance',
      });
    }
  }

  /**
   * Add a friend to the bot's friend list
   */
  static async addFriend(req: Request, res: Response) {
    const { botId } = req.params;
    const { epicId } = req.body;

    if (!epicId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_EPIC_ID',
        message: 'epicId is required',
      });
    }

    try {
      const botClient = botManager.getBot(botId);

      if (!botClient) {
        return res.status(404).json({
          success: false,
          error: 'BOT_NOT_FOUND',
          message: 'Bot not found or offline',
        });
      }

      if (!botClient.isReady()) {
        return res.status(400).json({
          success: false,
          error: 'BOT_OFFLINE',
          message: 'Bot is not online. Cannot add friend.',
        });
      }

      await botClient.addFriend(epicId);

      log.info('Friend request sent', { botId, epicId });

      res.json({
        success: true,
        data: { botId, epicId },
        message: 'Friend request sent successfully',
      });
    } catch (error: any) {
      log.error('Failed to add friend:', error);

      res.status(500).json({
        success: false,
        error: 'ADD_FRIEND_FAILED',
        message: error.message || 'Failed to send friend request',
      });
    }
  }

  /**
   * Get bot activities
   */
  static async getBotActivities(req: Request, res: Response) {
    const { botId } = req.params;
    const { limit = '50', offset = '0', type } = req.query;

    try {
      // Check if bot exists
      const bot = await prisma.bot.findUnique({
        where: { id: botId },
      });

      if (!bot) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Bot not found',
        });
      }

      // Build where clause
      const where: any = { botId };
      if (type) {
        where.type = type;
      }

      // Get activities with pagination
      const activities = await prisma.botActivity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      });

      // Get total count
      const total = await prisma.botActivity.count({ where });

      return res.json({
        success: true,
        data: {
          activities,
          total,
          limit: parseInt(limit as string),
          offset: parseInt(offset as string),
        },
      });
    } catch (error) {
      log.error('Failed to get bot activities', { botId, error });

      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get bot activities',
      });
    }
  }
}
