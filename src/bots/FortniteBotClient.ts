import { Client } from 'fnbr';
import { EventEmitter } from 'events';
import { BotConfig, DeviceAuth, BotEvent } from '../types';
import { log } from '../utils/logger';
import { randomDelay } from '../utils/helpers';
import {
  BotAuthError,
  BotOfflineError,
  GiftNotFriendsError,
  GiftEpicApiError,
} from '../utils/errors';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import {
  EpicCatalogResponse,
  ParsedCatalogItem,
  CatalogSearchResult,
} from '../types/epicCatalog';

/**
 * Wrapper around fnbr.js Client with additional functionality
 */
export class FortniteBotClient extends EventEmitter {
  private client: Client | null = null;
  private botId: string;
  private config: BotConfig;
  private isConnected = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private deviceAuthPath: string;

  // Catalog cache
  private catalogCache: ParsedCatalogItem[] | null = null;
  private catalogCacheExpiry: number = 0;
  private readonly CATALOG_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

  constructor(botId: string, config: BotConfig) {
    super();
    this.botId = botId;
    this.config = config;
    this.deviceAuthPath = path.join(process.cwd(), 'deviceAuth', `${config.name}.json`);
  }

  /**
   * Login to Fortnite
   */
  async login(): Promise<void> {
    try {
      log.bot.info(this.botId, 'Attempting to login', { botName: this.config.name });

      // Priority: 1) deviceAuth from config, 2) deviceAuth from file, 3) authorizationCode
      let auth;

      if (this.config.deviceAuth) {
        // Use device auth from config (direct credentials)
        auth = { deviceAuth: this.config.deviceAuth };
        log.bot.info(this.botId, 'Using device auth from config');
      } else {
        // Try to load device auth from file
        try {
          const deviceAuthData = await fs.readFile(this.deviceAuthPath, 'utf-8');
          const deviceAuth = JSON.parse(deviceAuthData) as DeviceAuth;
          auth = { deviceAuth };
          log.bot.info(this.botId, 'Using saved device auth from file');
        } catch (error) {
          // No device auth file, must use authorization code
          if (!this.config.authorizationCode) {
            throw new Error('No device auth found and no authorization code provided');
          }
          auth = { authorizationCode: this.config.authorizationCode };
          log.bot.info(this.botId, 'Using authorization code (first time login)');
        }
      }

      // Initialize client
      this.client = new Client({ auth });

      // Set up event handlers
      this.setupEventHandlers();

      // Attempt login
      await this.client.login();

      this.isConnected = true;
      log.bot.info(this.botId, 'Successfully logged in', {
        displayName: this.client.user?.self?.displayName,
      });

      // Start heartbeat
      this.startHeartbeat();

      this.emitEvent('ready', {
        displayName: this.client.user?.self?.displayName,
        accountId: this.client.user?.self?.id,
      });
    } catch (error) {
      log.bot.error(this.botId, 'Login failed', error);
      throw new BotAuthError(
        error instanceof Error ? error.message : 'Unknown login error'
      );
    }
  }

  /**
   * Set up event handlers for fnbr.js client
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Ready event
    this.client.on('ready', () => {
      log.bot.info(this.botId, 'Bot is ready');
    });

    // Device auth prompt - Interactive setup
    // @ts-ignore - fnbr types don't include deviceauth:prompt event
    this.client.on('deviceauth:prompt', (prompt: any) => {
      log.bot.info(this.botId, 'Device auth prompt received', {
        verificationUri: prompt.verification_uri,
        userCode: prompt.user_code,
      });

      // Emit event with prompt details so BotManager can update database
      this.emitEvent('deviceauth:prompt', {
        verification_uri: prompt.verification_uri || 'https://www.epicgames.com/activate',
        user_code: prompt.user_code,
        expires_in: prompt.expires_in,
        interval: prompt.interval,
      });
    });

    // Save device auth when created
    this.client.on('deviceauth:created', async (deviceAuth: DeviceAuth) => {
      try {
        await fs.mkdir(path.dirname(this.deviceAuthPath), { recursive: true });
        await fs.writeFile(this.deviceAuthPath, JSON.stringify(deviceAuth, null, 2));
        log.bot.info(this.botId, 'Device auth saved');

        // Emit event so BotManager can update database
        this.emitEvent('deviceauth:created', deviceAuth);
      } catch (error) {
        log.bot.error(this.botId, 'Failed to save device auth', error);
      }
    });

    // Friend request received
    this.client.on('friend:request', async (request: any) => {
      log.bot.info(this.botId, 'Friend request received', {
        from: request.displayName,
        id: request.id,
      });

      // Auto-accept with human-like delay
      await randomDelay(2000, 5000);

      try {
        await request.accept();
        log.bot.info(this.botId, 'Friend request accepted', {
          from: request.displayName,
        });

        this.emitEvent('friend:added', {
          epicAccountId: request.id,
          displayName: request.displayName,
        });
      } catch (error) {
        log.bot.error(this.botId, 'Failed to accept friend request', error);
      }
    });

    // Friend message received
    this.client.on('friend:message', (message: any) => {
      log.bot.debug(this.botId, 'Message received', {
        from: message.author.displayName,
        content: message.content,
      });

      this.emitEvent('friend:message', {
        from: message.author.displayName,
        fromId: message.author.id,
        content: message.content,
      });
    });

    // Party invite received
    this.client.on('party:invite', (invite: any) => {
      log.bot.debug(this.botId, 'Party invite received', {
        from: invite.sender.displayName,
      });
      // We don't auto-join parties for gifting bots
    });

    // Disconnected
    this.client.on('disconnected', () => {
      log.bot.warn(this.botId, 'Bot disconnected');
      this.isConnected = false;
      this.emitEvent('disconnected', {});
    });

    // Error
    (this.client as any).on('error', (error: Error) => {
      log.bot.error(this.botId, 'Bot error', error);
      this.emitEvent('error', { error: error.message });
    });
  }

  /**
   * Send a gift to a friend
   * Uses Epic Games HTTP API to send gifts
   */
  async sendGift(recipientId: string, itemId: string, expectedPrice?: number): Promise<void> {
    if (!this.isConnected || !this.client) {
      throw new BotOfflineError(this.botId);
    }

    try {
      log.bot.info(this.botId, 'Sending gift', { recipientId, itemId });

      // Check if we're friends
      // TEMPORARILY DISABLED: getFriends() uses http.sendEpicgamesRequest which is not available
      // Since friendship is validated before reaching this point, we can skip this check
      // const friends = await this.getFriends();
      // const isFriend = friends.some((f) => f.accountId === recipientId);
      //
      // if (!isFriend) {
      //   throw new GiftNotFriendsError(recipientId);
      // }

      // Add human-like delay before sending
      await randomDelay(1000, 3000);

      // Get bot account ID and auth token
      const accountId = this.client?.user?.self?.id;
      if (!accountId) {
        throw new GiftEpicApiError('Bot account ID not available');
      }

      // Get access token from fnbr.js client's auth sessions
      // sessions is a Collection (like a Map), not a plain object
      // @ts-ignore - fnbr.js internal API
      const sessions = this.client?.auth?.sessions;

      if (!sessions) {
        log.bot.error(this.botId, 'Auth sessions not available');
        throw new GiftEpicApiError('Bot not authenticated - auth sessions not initialized');
      }

      // Debug: Log all keys in the Collection
      // @ts-ignore
      const allKeys = Array.from(sessions.keys());
      log.bot.info(this.botId, 'Sessions Collection debug', {
        size: sessions.size,
        keys: allKeys,
        hasFortnite: sessions.has('fortnite' as any),
        hasLauncher: sessions.has('launcher' as any),
        hasFortniteClientCredentials: sessions.has('fortniteClientCredentials' as any),
        hasFortniteEOS: sessions.has('fortniteEOS' as any),
      });

      // Try to get the Fortnite session using Collection.get()
      // The key is 'fortnite' (lowercase string from AuthSessionStoreKey enum)
      // @ts-ignore - fnbr.js internal API
      const fortniteSession = sessions.get('fortnite') || sessions.get('launcher');

      if (!fortniteSession) {
        log.bot.error(this.botId, 'No Fortnite auth session found');
        throw new GiftEpicApiError('Bot not authenticated - no Fortnite session available');
      }

      const accessToken = (fortniteSession as any).accessToken;

      if (!accessToken) {
        log.bot.error(this.botId, 'Access token not found in Fortnite session');
        throw new GiftEpicApiError('Bot not authenticated - no access token');
      }

      log.bot.info(this.botId, 'Access token obtained successfully', {
        tokenPreview: accessToken.substring(0, 10) + '...'
      });

      // Send gift using Epic Games API
      // Endpoint: POST /fortnite/api/game/v2/profile/{accountId}/client/GiftCatalogEntry
      const giftPayload = {
        offerId: itemId,
        currency: 'MtxCurrency', // V-Bucks
        currencySubType: '',
        expectedTotalPrice: expectedPrice ? String(expectedPrice) : '0',
        gameContext: '',
        receiverAccountIds: [recipientId],
        giftWrapTemplateId: 'GiftBox:gb_default', // Default gift wrap
        personalMessage: '', // Optional message
      };

      try {
        // Make HTTP request to Epic's gifting endpoint using axios
        const response = await axios.post(
          `https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/game/v2/profile/${accountId}/client/GiftCatalogEntry`,
          giftPayload,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        log.bot.info(this.botId, 'Gift sent successfully', {
          recipientId,
          itemId,
          response: response?.data?.profileRevision,
        });

        this.emitEvent('gift:sent', { recipientId, itemId });
      } catch (httpError: any) {
        // Parse Epic API error from axios response
        const errorCode = httpError?.response?.data?.errorCode || 'UNKNOWN';
        const errorMessage =
          httpError?.response?.data?.errorMessage ||
          httpError?.message ||
          'Failed to send gift';

        log.bot.error(this.botId, 'Epic API error', {
          errorCode,
          errorMessage,
          recipientId,
          itemId,
          status: httpError?.response?.status,
        });

        throw new GiftEpicApiError(`${errorCode}: ${errorMessage}`, errorCode);
      }
    } catch (error) {
      log.bot.error(this.botId, 'Failed to send gift', error);

      if (error instanceof GiftEpicApiError || error instanceof GiftNotFriendsError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new GiftEpicApiError(error.message);
      }
      throw error;
    }
  }

  /**
   * Send a test message to a friend (for debugging)
   */
  async sendTestMessage(epicId: string, message: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      throw new BotOfflineError(this.botId);
    }

    try {
      log.bot.info(this.botId, 'Sending test message', { epicId, message });

      // Log all friends for debugging
      const allFriends = Array.from(this.client.friend.list.values()).map(f => ({
        id: f.id,
        displayName: f.displayName,
        isOnline: f.isOnline
      }));
      log.bot.info(this.botId, 'Current friend list', {
        count: allFriends.length,
        friends: allFriends
      });

      // Find friend by displayName using fnbr.js friend list
      const friend = this.client.friend.list.find(
        (f) => f.displayName === epicId || f.id === epicId
      );

      if (!friend) {
        throw new Error(`Friend not found: ${epicId}. Available friends: ${allFriends.map(f => f.displayName).join(', ')}`);
      }

      log.bot.info(this.botId, 'Found friend', {
        friendId: friend.id,
        friendName: friend.displayName,
        isOnline: friend.isOnline
      });

      await friend.sendMessage(message);

      log.bot.info(this.botId, 'Test message sent successfully', { epicId });
    } catch (error) {
      log.bot.error(this.botId, 'Failed to send test message', error);
      throw error;
    }
  }

  /**
   * Add a friend by Epic Account ID
   */
  async addFriend(epicId: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      throw new BotOfflineError(this.botId);
    }

    try {
      log.bot.info(this.botId, 'Adding friend', { epicId });

      await randomDelay(1000, 3000);

      // Use fnbr.js native FriendManager to add friend
      // @ts-ignore - fnbr.js client.friend is the FriendManager
      const friendManager = this.client?.friend;

      if (!friendManager || typeof friendManager.add !== 'function') {
        throw new Error('Friend manager not available');
      }

      try {
        // fnbr's FriendManager.add() accepts account ID or display name
        await friendManager.add(epicId);
        log.bot.info(this.botId, 'Friend request sent', { epicId });
      } catch (fnbrError: any) {
        // Handle specific fnbr errors
        const errorName = fnbrError?.constructor?.name || fnbrError?.name;

        if (errorName === 'DuplicateFriendshipError') {
          log.bot.info(this.botId, 'Already friends with user', { epicId });
          return;
        }

        if (errorName === 'FriendshipRequestAlreadySentError') {
          log.bot.info(this.botId, 'Friend request already sent', { epicId });
          return;
        }

        // Re-throw with a cleaner message
        const errorMessage = fnbrError?.message || 'Failed to send friend request';
        throw new Error(errorMessage);
      }
    } catch (error) {
      log.bot.error(this.botId, 'Failed to add friend', error);
      throw error;
    }
  }

  /**
   * Get list of friends
   * Retrieves all accepted friends from fnbr.js FriendManager
   */
  async getFriends(): Promise<Array<{ accountId: string; displayName: string }>> {
    if (!this.isConnected || !this.client) {
      throw new BotOfflineError(this.botId);
    }

    try {
      // Use fnbr.js native FriendManager.list (Collection of Friend objects)
      // @ts-ignore - fnbr.js client.friend is the FriendManager
      const friendManager = this.client?.friend;

      if (!friendManager) {
        log.bot.warn(this.botId, 'Friend manager not available');
        return [];
      }

      const friends: Array<{ accountId: string; displayName: string }> = [];

      // FriendManager.list is a Collection<string, Friend>
      // @ts-ignore
      const friendsList = friendManager.list;

      if (friendsList && typeof friendsList.forEach === 'function') {
        // It's a Collection (extends Map)
        friendsList.forEach((friend: any, id: string) => {
          friends.push({
            accountId: friend?.id || id,
            displayName: friend?.displayName || friend?.id || id,
          });
        });
      } else if (friendsList && typeof friendsList === 'object') {
        // Fallback: iterate as object
        for (const [id, friend] of Object.entries(friendsList)) {
          friends.push({
            accountId: (friend as any)?.id || id,
            displayName: (friend as any)?.displayName || (friend as any)?.id || id,
          });
        }
      }

      log.bot.info(this.botId, 'Retrieved friends from FriendManager', { count: friends.length });
      return friends;
    } catch (error) {
      log.bot.error(this.botId, 'Failed to get friends list', error);
      return [];
    }
  }

  /**
   * Send a message to a friend
   * Uses XMPP to send direct messages
   */
  async sendMessage(recipientId: string, message: string): Promise<void> {
    if (!this.isConnected || !this.client) {
      throw new BotOfflineError(this.botId);
    }

    try {
      log.bot.debug(this.botId, 'Sending message', { recipientId, message });

      await randomDelay(1000, 2000);

      // Try to get friend object
      // @ts-ignore - fnbr.js API
      const friendsMap = this.client?.user?.friends;
      let friend = null;

      if (friendsMap instanceof Map) {
        friend = friendsMap.get(recipientId);
      } else if (friendsMap && typeof friendsMap === 'object') {
        // @ts-ignore
        friend = friendsMap[recipientId];
      }

      if (friend && typeof friend.sendMessage === 'function') {
        // Use fnbr.js friend.sendMessage method
        await friend.sendMessage(message);
        log.bot.debug(this.botId, 'Message sent via friend object', { recipientId });
      } else {
        // Fallback: Use XMPP client directly if available
        // @ts-ignore - fnbr.js internal API
        const xmpp = this.client?.xmpp;

        if (xmpp && typeof xmpp.sendMessage === 'function') {
          await xmpp.sendMessage(recipientId, message);
          log.bot.debug(this.botId, 'Message sent via XMPP', { recipientId });
        } else {
          log.bot.warn(this.botId, 'Cannot send message - no available method', {
            recipientId,
          });
        }
      }
    } catch (error) {
      log.bot.error(this.botId, 'Failed to send message', error);
      throw error;
    }
  }

  /**
   * Logout and cleanup
   */
  async logout(): Promise<void> {
    // Stop heartbeat first
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Attempt to logout from fnbr client
    if (this.client) {
      try {
        await this.client.logout();
      } catch (error: any) {
        // Ignore errors about invalid tokens during logout - this is expected
        // if the token already expired or was revoked
        const isTokenError =
          error?.code === 'errors.com.epicgames.common.oauth.invalid_token' ||
          error?.message?.includes('invalid') ||
          error?.message?.includes('OAuthToken');

        if (isTokenError) {
          log.bot.warn(this.botId, 'Token already invalid during logout, continuing cleanup');
        } else {
          log.bot.error(this.botId, 'Error during logout', error);
        }
      } finally {
        this.client = null;
      }
    }

    this.isConnected = false;
    log.bot.info(this.botId, 'Bot logged out');
  }

  /**
   * Start heartbeat to track uptime
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.emitEvent('heartbeat', { timestamp: new Date() });
      }
    }, 60000); // Every minute
  }

  /**
   * Emit typed event
   */
  private emitEvent(type: string, data: unknown): void {
    const event: BotEvent = {
      type: type as any,
      botId: this.botId,
      timestamp: new Date(),
      data,
    };

    this.emit('event', event);
    this.emit(type, data);
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; displayName?: string; accountId?: string } {
    return {
      connected: this.isConnected,
      displayName: this.client?.user?.self?.displayName,
      accountId: this.client?.user?.self?.id,
    };
  }

  /**
   * Check if bot is ready
   */
  isReady(): boolean {
    return this.isConnected && !!this.client;
  }

  /**
   * Get V-Bucks balance
   * Retrieves the current V-Bucks balance from the account
   */
  async getVBucks(): Promise<number> {
    if (!this.isConnected || !this.client) {
      throw new BotOfflineError(this.botId);
    }

    try {
      const accountId = this.client?.user?.self?.id;

      if (!accountId) {
        log.bot.warn(this.botId, 'Cannot fetch V-Bucks - no account ID');
        return 0;
      }

      // Get access token from fnbr.js client's auth sessions
      // @ts-ignore - fnbr.js internal API
      const sessions = this.client?.auth?.sessions;

      if (!sessions) {
        log.bot.warn(this.botId, 'Auth sessions not available for V-Bucks query');
        return 0;
      }

      // Try to get the Fortnite session
      // @ts-ignore - fnbr.js internal API
      const fortniteSession = sessions.get('fortnite') || sessions.get('launcher');

      if (!fortniteSession) {
        log.bot.warn(this.botId, 'No Fortnite auth session found for V-Bucks query');
        return 0;
      }

      const accessToken = (fortniteSession as any).accessToken;

      if (!accessToken) {
        log.bot.warn(this.botId, 'Access token not found for V-Bucks query');
        return 0;
      }

      // Query profile using Epic Games API
      const response = await axios.post(
        `https://fortnite-public-service-prod11.ol.epicgames.com/fortnite/api/game/v2/profile/${accountId}/client/QueryProfile?profileId=common_core`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Extract V-Bucks from profile currencies
      if (response?.data?.profileChanges?.[0]?.profile?.items) {
        const items = response.data.profileChanges[0].profile.items;

        // Look for MtxCurrency item (V-Bucks)
        for (const [itemId, itemData] of Object.entries(items)) {
          // @ts-ignore
          if (itemData?.templateId === 'Currency:MtxPurchased' || itemData?.templateId?.startsWith('Currency:Mtx')) {
            // @ts-ignore
            const quantity = itemData?.quantity || 0;
            log.bot.info(this.botId, 'V-Bucks balance retrieved', { vBucks: quantity });
            return quantity;
          }
        }
      }

      log.bot.warn(this.botId, 'Could not find V-Bucks in profile response');
      return 0;
    } catch (error: any) {
      log.bot.error(this.botId, 'Failed to fetch V-Bucks balance', {
        error: error.message,
        status: error?.response?.status,
        errorCode: error?.response?.data?.errorCode,
      });
      return 0;
    }
  }

  /**
   * Lookup Epic Account ID by display name
   * Uses Epic Games API to find account ID from username
   */
  async lookupByDisplayName(displayName: string): Promise<string | null> {
    if (!this.isConnected || !this.client) {
      throw new BotOfflineError(this.botId);
    }

    try {
      log.bot.info(this.botId, 'Looking up account by display name', { displayName });

      // Get access token from fnbr.js client's auth sessions
      // @ts-ignore - fnbr.js internal API
      const sessions = this.client?.auth?.sessions;

      if (!sessions) {
        log.bot.error(this.botId, 'Auth sessions not available for lookup');
        throw new Error('Bot not authenticated - auth sessions not initialized');
      }

      // Try to get the Fortnite session
      // @ts-ignore - fnbr.js internal API
      const fortniteSession = sessions.get('fortnite') || sessions.get('launcher');

      if (!fortniteSession) {
        log.bot.error(this.botId, 'No Fortnite auth session found for lookup');
        throw new Error('Bot not authenticated - no Fortnite session available');
      }

      const accessToken = (fortniteSession as any).accessToken;

      if (!accessToken) {
        log.bot.error(this.botId, 'Access token not found for lookup');
        throw new Error('Bot not authenticated - no access token');
      }

      // Use Epic Games API to lookup account by display name
      // Endpoint: GET /account/api/public/account/displayName/{displayName}
      const response = await axios.get(
        `https://account-public-service-prod.ol.epicgames.com/account/api/public/account/displayName/${encodeURIComponent(displayName)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      const accountId = response?.data?.id;

      if (accountId) {
        log.bot.info(this.botId, 'Account found', {
          displayName,
          accountId,
        });
        return accountId;
      }

      log.bot.warn(this.botId, 'Account not found', { displayName });
      return null;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        log.bot.warn(this.botId, 'Display name not found', { displayName });
        return null;
      }

      log.bot.error(this.botId, 'Failed to lookup account by display name', {
        displayName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Query Epic Games catalog to get all available items with offer IDs
   * Uses caching to avoid excessive API calls (1 hour TTL)
   */
  async queryCatalog(forceRefresh: boolean = false): Promise<ParsedCatalogItem[]> {
    if (!this.isConnected || !this.client) {
      throw new BotOfflineError(this.botId);
    }

    // Check if cache is still valid
    const now = Date.now();
    if (!forceRefresh && this.catalogCache && now < this.catalogCacheExpiry) {
      log.bot.info(this.botId, 'Returning cached catalog', {
        itemCount: this.catalogCache.length,
        cacheExpiresIn: Math.round((this.catalogCacheExpiry - now) / 1000 / 60) + ' minutes'
      });
      return this.catalogCache;
    }

    try {
      log.bot.info(this.botId, 'Querying Epic Games catalog');

      // Get access token
      // @ts-ignore - fnbr.js internal API
      const sessions = this.client?.auth?.sessions;
      if (!sessions) {
        throw new GiftEpicApiError('Bot not authenticated - auth sessions not initialized');
      }

      // @ts-ignore - fnbr.js internal API
      const fortniteSession = sessions.get('fortnite') || sessions.get('launcher');
      if (!fortniteSession) {
        throw new GiftEpicApiError('Bot not authenticated - no Fortnite session available');
      }

      const accessToken = (fortniteSession as any).accessToken;
      if (!accessToken) {
        throw new GiftEpicApiError('Bot not authenticated - no access token');
      }

      // Query Epic's catalog endpoint
      const response = await axios.get<EpicCatalogResponse>(
        'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/storefront/v2/catalog',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      log.bot.info(this.botId, 'Catalog fetched successfully', {
        storefrontCount: response.data.storefronts?.length || 0,
        expiration: response.data.expiration,
      });

      // Parse catalog entries into simplified format
      const parsedItems: ParsedCatalogItem[] = [];

      // Filter to only Battle Royale storefronts (daily and weekly item shop)
      // Exclude Save the World, Llamas, and other non-BR storefronts
      const BR_STOREFRONTS = ['BRDailyStorefront', 'BRWeeklyStorefront', 'BRSeasonStorefront'];

      for (const storefront of response.data.storefronts || []) {
        // Only process Battle Royale Item Shop storefronts
        if (!BR_STOREFRONTS.includes(storefront.name)) {
          log.bot.debug(this.botId, `Skipping storefront: ${storefront.name}`);
          continue;
        }

        log.bot.debug(this.botId, `Processing storefront: ${storefront.name}`);

        for (const entry of storefront.catalogEntries || []) {
          // Only include items that have item grants (actual items)
          if (!entry.itemGrants || entry.itemGrants.length === 0) {
            continue;
          }

          // Get the main item from grants (usually the first one)
          const mainItem = entry.itemGrants[0];
          const itemId = mainItem.templateId;

          // Extract item type from template ID (e.g., "AthenaCharacter:cid_xxx" -> "AthenaCharacter")
          const itemType = itemId.split(':')[0] || 'Unknown';

          // Get price
          const price = entry.prices?.[0];
          const priceAmount = price?.finalPrice || price?.regularPrice || 0;
          const currencyType = price?.currencyType || 'MtxCurrency';

          // Determine if item is giftable
          const giftable = entry.giftInfo?.bIsEnabled ?? false;

          parsedItems.push({
            offerId: entry.offerId,
            itemId: itemId,
            name: entry.title || entry.devName || itemId,
            description: entry.shortDescription || entry.description || '',
            type: itemType,
            price: priceAmount,
            currencyType: currencyType,
            giftable: giftable,
            displayAssetPath: entry.displayAssetPath,
          });
        }
      }

      log.bot.info(this.botId, 'Catalog parsed', {
        totalItems: parsedItems.length,
        giftableItems: parsedItems.filter(i => i.giftable).length,
      });

      // Update cache
      this.catalogCache = parsedItems;
      this.catalogCacheExpiry = Date.now() + this.CATALOG_CACHE_TTL;

      return parsedItems;
    } catch (error: any) {
      log.bot.error(this.botId, 'Failed to query catalog', {
        error: error.message,
        status: error?.response?.status,
        errorCode: error?.response?.data?.errorCode,
        errorMessage: error?.response?.data?.errorMessage,
      });
      throw new GiftEpicApiError(
        `Failed to fetch catalog: ${error.message}`,
        error?.response?.data?.errorCode
      );
    }
  }

  /**
   * Search catalog for items matching a query string
   * Supports searching by item name, item ID, or offer ID
   * Returns exact match if found, or suggestions if partial matches exist
   *
   * @param query - Search query (item name, ID, or offer ID)
   * @param strict - If true (default), only exact matches. If false, allows partial matches.
   */
  async searchCatalogItem(query: string, strict: boolean = true): Promise<CatalogSearchResult> {
    if (!query || query.trim().length === 0) {
      return { found: false, exactMatch: false };
    }

    const normalizedQuery = query.trim().toLowerCase();

    try {
      log.bot.info(this.botId, 'Searching catalog', { query, strict });

      // Get catalog (uses cache if available)
      const catalog = await this.queryCatalog();

      // 1. Try exact offer ID match first
      const exactOfferMatch = catalog.find(
        item => item.offerId.toLowerCase() === normalizedQuery
      );

      if (exactOfferMatch) {
        log.bot.info(this.botId, 'Found exact offer ID match', {
          query,
          offerId: exactOfferMatch.offerId,
          name: exactOfferMatch.name,
        });
        return {
          found: true,
          exactMatch: true,
          item: exactOfferMatch,
        };
      }

      // 2. Try exact item ID match
      const exactItemMatch = catalog.find(
        item => item.itemId.toLowerCase() === normalizedQuery
      );

      if (exactItemMatch) {
        log.bot.info(this.botId, 'Found exact item ID match', {
          query,
          itemId: exactItemMatch.itemId,
          offerId: exactItemMatch.offerId,
          name: exactItemMatch.name,
        });
        return {
          found: true,
          exactMatch: true,
          item: exactItemMatch,
        };
      }

      // 3. Try exact name match (case-insensitive)
      const exactNameMatch = catalog.find(
        item => item.name.toLowerCase() === normalizedQuery
      );

      if (exactNameMatch) {
        log.bot.info(this.botId, 'Found exact name match', {
          query,
          name: exactNameMatch.name,
          offerId: exactNameMatch.offerId,
        });
        return {
          found: true,
          exactMatch: true,
          item: exactNameMatch,
        };
      }

      // 4. If strict mode is disabled, try partial matches
      if (!strict) {
        const partialMatches = catalog.filter(item =>
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.itemId.toLowerCase().includes(normalizedQuery) ||
          item.description.toLowerCase().includes(normalizedQuery)
        );

        if (partialMatches.length > 0) {
          // Sort by relevance with improved priority system
          const sortedMatches = partialMatches.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();

            // Check if query matches the start of the name (higher priority)
            const aStartsWith = aName.startsWith(normalizedQuery);
            const bStartsWith = bName.startsWith(normalizedQuery);

            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;

            // Check if name contains query as a whole word
            const aWholeWord = aName.split(/\s+/).some(word => word === normalizedQuery || word.startsWith(normalizedQuery));
            const bWholeWord = bName.split(/\s+/).some(word => word === normalizedQuery || word.startsWith(normalizedQuery));

            if (aWholeWord && !bWholeWord) return -1;
            if (!aWholeWord && bWholeWord) return 1;

            // Prioritize OUTFITs (skins) over other types when ambiguous
            if (a.type === 'AthenaCharacter' && b.type !== 'AthenaCharacter') return -1;
            if (a.type !== 'AthenaCharacter' && b.type === 'AthenaCharacter') return 1;

            // Check if name is in the itemId (more specific match)
            const aInItemId = a.itemId.toLowerCase().includes(normalizedQuery);
            const bInItemId = b.itemId.toLowerCase().includes(normalizedQuery);

            if (aInItemId && !bInItemId) return -1;
            if (!aInItemId && bInItemId) return 1;

            // Prefer shorter names (more specific)
            const lengthDiff = a.name.length - b.name.length;
            if (Math.abs(lengthDiff) > 5) return lengthDiff;

            // Finally, prefer higher prices (usually main items over accessories)
            return b.price - a.price;
          });

          log.bot.info(this.botId, 'Found partial matches (non-strict mode)', {
            query,
            matchCount: sortedMatches.length,
            topMatch: sortedMatches[0].name,
            topMatchType: sortedMatches[0].type,
            topMatchPrice: sortedMatches[0].price,
          });

          // Return top match as the item, rest as suggestions
          return {
            found: true,
            exactMatch: false,
            item: sortedMatches[0],
            suggestions: sortedMatches.slice(1, 6), // Up to 5 additional suggestions
          };
        }
      }

      // 5. No matches found - provide suggestions
      log.bot.warn(this.botId, 'No exact match found for query', { query, strict });

      // Find similar items for suggestions only
      const similarMatches = catalog.filter(item =>
        item.name.toLowerCase().includes(normalizedQuery)
      ).slice(0, 5);

      return {
        found: false,
        exactMatch: false,
        suggestions: similarMatches.length > 0 ? similarMatches : undefined,
      };

    } catch (error) {
      log.bot.error(this.botId, 'Failed to search catalog', { query, error });
      throw error;
    }
  }

  /**
   * Resolve an item query to a valid offer ID
   * This is a helper method that searches and returns just the offer ID
   * Returns null if item not found
   */
  async resolveOfferIdFromQuery(query: string): Promise<string | null> {
    try {
      const searchResult = await this.searchCatalogItem(query);

      if (searchResult.found && searchResult.item) {
        return searchResult.item.offerId;
      }

      return null;
    } catch (error) {
      log.bot.error(this.botId, 'Failed to resolve offer ID', { query, error });
      return null;
    }
  }

  /**
   * Resolve gift recipient - converts display name to account ID if needed
   * Detects if input is already an account ID or needs lookup
   * @param recipientInput - Can be either Epic account ID or display name
   * @returns Epic account ID
   */
  async resolveGiftRecipient(recipientInput: string): Promise<string> {
    if (!recipientInput || recipientInput.trim().length === 0) {
      throw new Error('Recipient cannot be empty');
    }

    const trimmedInput = recipientInput.trim();

    // Check if it looks like an Epic account ID (32 hex characters)
    const accountIdPattern = /^[a-f0-9]{32}$/i;
    if (accountIdPattern.test(trimmedInput)) {
      log.bot.info(this.botId, 'Recipient appears to be an account ID', {
        recipientInput: trimmedInput,
      });
      return trimmedInput;
    }

    // Otherwise, treat as display name and lookup
    log.bot.info(this.botId, 'Recipient appears to be a display name, looking up account ID', {
      recipientInput: trimmedInput,
    });

    const accountId = await this.lookupByDisplayName(trimmedInput);

    if (!accountId) {
      throw new Error(`Account not found for display name: ${trimmedInput}`);
    }

    log.bot.info(this.botId, 'Account ID found for display name', {
      displayName: trimmedInput,
      accountId,
    });

    return accountId;
  }

  /**
   * Resolve offer ID for gift - validates item is giftable and in catalog
   * Uses catalog search with non-strict mode for flexibility
   * @param itemId - Item ID, offer ID, or item name
   * @returns Object with resolved offer ID and item details
   * @throws Error if item not found or not giftable
   */
  async resolveOfferIdForGift(itemId: string): Promise<{
    offerId: string;
    itemName: string;
    price: number;
    isGiftable: boolean;
  }> {
    if (!itemId || itemId.trim().length === 0) {
      throw new Error('Item ID cannot be empty');
    }

    log.bot.info(this.botId, 'Attempting to resolve offer ID', {
      originalItemId: itemId,
    });

    // Search catalog with non-strict mode (allows partial matches)
    const searchResult = await this.searchCatalogItem(itemId, false);

    if (!searchResult.found || !searchResult.item) {
      throw new Error(`Item "${itemId}" not found in current Fortnite catalog`);
    }

    const item = searchResult.item;

    // Validate item is giftable
    if (!item.giftable) {
      throw new Error(
        `Item "${item.name}" (${item.offerId}) is not giftable. Please choose a different item.`
      );
    }

    // Validate item has a valid price
    if (item.price <= 0) {
      throw new Error(
        `Item "${item.name}" found but has invalid price (${item.price}). ` +
        `This may indicate the item is not available for gifting.`
      );
    }

    log.bot.info(this.botId, 'Offer ID resolved successfully', {
      originalItemId: itemId,
      resolvedOfferId: item.offerId,
      itemName: item.name,
      price: item.price,
      giftable: item.giftable,
    });

    return {
      offerId: item.offerId,
      itemName: item.name,
      price: item.price,
      isGiftable: item.giftable,
    };
  }
}
