import { log } from '../utils/logger';

interface FortniteAPIConfig {
  baseUrl: string;
  rateLimitPerMinute: number;
}

// Fortnite-API.com types
interface FortniteAPICom_Item {
  id: string;
  name: string;
  description?: string;
  type: {
    value: string;
    displayValue: string;
    backendValue: string;
  };
  rarity: {
    value: string;
    displayValue: string;
    backendValue: string;
  };
  images: {
    smallIcon?: string;
    icon?: string;
    featured?: string;
  };
  set?: {
    value: string;
    text: string;
  };
}

interface FortniteAPICom_Entry {
  regularPrice: number;
  finalPrice: number;
  offerId: string;
  inDate: string;
  outDate: string;
  giftable: boolean;
  refundable: boolean;
  brItems?: FortniteAPICom_Item[];
  bundle?: {
    name: string;
    info: string;
    image: string;
  };
}

interface FortniteAPICom_Response {
  status: number;
  data: {
    date: string;
    hash: string;
    entries: FortniteAPICom_Entry[];
    vbuckIcon?: string;
  };
}

export interface ParsedFortniteItem {
  itemId: string;
  offerId: string;
  name: string;
  description: string;
  type: 'SKIN' | 'PICKAXE' | 'EMOTE' | 'BACKPACK' | 'GLIDER' | 'WRAP' | 'BUNDLE' | 'OTHER';
  rarity: string;
  image: string;
  baseVbucks: number;
  giftAllowed: boolean;
  inDate: string;
  outDate: string;
}

export class FortniteAPIService {
  private static config: FortniteAPIConfig = {
    baseUrl: 'https://fortnite-api.com',
    rateLimitPerMinute: 100, // Fortnite-API.com is more generous
  };

  private static lastRequestTime = 0;
  private static requestCount = 0;
  private static readonly RATE_LIMIT_WINDOW = 60000; // 1 minute

  /**
   * Rate limiting helper
   */
  private static async checkRateLimit(): Promise<void> {
    const now = Date.now();

    // Reset counter if window has passed
    if (now - this.lastRequestTime > this.RATE_LIMIT_WINDOW) {
      this.requestCount = 0;
      this.lastRequestTime = now;
    }

    // Check if limit reached
    if (this.requestCount >= this.config.rateLimitPerMinute) {
      const waitTime = this.RATE_LIMIT_WINDOW - (now - this.lastRequestTime);
      log.warn(`Rate limit reached. Waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }

    this.requestCount++;
  }

  /**
   * Map Fortnite-API.com type to our ProductType
   */
  private static mapProductType(backendValue: string | null | undefined): ParsedFortniteItem['type'] {
    if (!backendValue) {
      return 'OTHER';
    }

    const typeMap: Record<string, ParsedFortniteItem['type']> = {
      'AthenaCharacter': 'SKIN',
      'AthenaPickaxe': 'PICKAXE',
      'AthenaDance': 'EMOTE',
      'AthenaBackpack': 'BACKPACK',
      'AthenaGlider': 'GLIDER',
      'AthenaItemWrap': 'WRAP',
      'AthenaBundle': 'BUNDLE',
    };

    return typeMap[backendValue] || 'OTHER';
  }

  /**
   * Map Fortnite-API.com rarity to standardized rarity
   */
  private static mapRarity(rarityValue: string | null | undefined): string {
    if (!rarityValue) {
      return 'common';
    }

    const rarityMap: Record<string, string> = {
      'common': 'common',
      'uncommon': 'uncommon',
      'rare': 'rare',
      'epic': 'epic',
      'legendary': 'legendary',
      'icon': 'icon',
      'marvel': 'marvel',
      'dc': 'dc',
      'starwars': 'starwars',
      'gaminglegends': 'gaminglegends',
      'shadow': 'shadow',
      'slurp': 'slurp',
      'dark': 'dark',
      'frozen': 'frozen',
      'lava': 'lava',
    };

    return rarityMap[rarityValue.toLowerCase()] || rarityValue.toLowerCase();
  }

  /**
   * Extract best image from item
   */
  private static getBestImage(item: FortniteAPICom_Item): string {
    // Try featured image first
    if (item.images?.featured) {
      return item.images.featured;
    }

    // Try icon
    if (item.images?.icon) {
      return item.images.icon;
    }

    // Try small icon
    if (item.images?.smallIcon) {
      return item.images.smallIcon;
    }

    // Fallback placeholder
    return '/images/placeholder-item.png';
  }

  /**
   * Fetch current Fortnite Item Shop from Fortnite-API.com
   */
  static async fetchItemShop(): Promise<ParsedFortniteItem[]> {
    try {
      await this.checkRateLimit();

      const url = `${this.config.baseUrl}/v2/shop`;

      log.info('Fetching Fortnite Item Shop from Fortnite-API.com...');

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Fortnite-API.com returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as FortniteAPICom_Response;

      if (data.status !== 200 || !data.data?.entries) {
        throw new Error('Invalid response from Fortnite-API.com');
      }

      log.info(`Fetched ${data.data.entries.length} entries from Fortnite-API.com`);
      log.info(`Shop date: ${data.data.date}`);

      // Parse and flatten items
      const parsedItems: ParsedFortniteItem[] = [];

      for (const entry of data.data.entries) {
        // Skip non-giftable items
        if (!entry.giftable) continue;

        // Skip if no BR items
        if (!entry.brItems || entry.brItems.length === 0) continue;

        // Skip if no valid price
        if (!entry.finalPrice || entry.finalPrice === 0) continue;

        // Process each item in the entry
        for (const item of entry.brItems) {
          // Skip certain types
          const excludedBackendTypes = [
            'AthenaLoadingScreen',
            'AthenaMusicPack',
            'AthenaSpray',
            'AthenaBanner',
            'AthenaPetCarrier', // Pets
            'CosmeticVariantToken',
          ];

          if (excludedBackendTypes.includes(item.type?.backendValue)) {
            continue;
          }

          parsedItems.push({
            itemId: item.id,
            offerId: entry.offerId,
            name: item.name,
            description: item.description || '',
            type: this.mapProductType(item.type?.backendValue),
            rarity: this.mapRarity(item.rarity?.value),
            image: this.getBestImage(item),
            baseVbucks: entry.finalPrice,
            giftAllowed: entry.giftable,
            inDate: entry.inDate,
            outDate: entry.outDate,
          });
        }
      }

      log.info(`Parsed ${parsedItems.length} valid giftable items`);

      return parsedItems;
    } catch (error) {
      log.error('Error fetching Fortnite Item Shop:', error);
      throw error;
    }
  }

  /**
   * Get daily shop rotation time (UTC)
   */
  static getShopRotationTime(): Date {
    const now = new Date();
    const shopReset = new Date(now);

    // Fortnite shop resets at 00:00 UTC (daily)
    shopReset.setUTCHours(0, 0, 0, 0);

    // If current time is past reset, set to next day
    if (now.getUTCHours() >= 0) {
      shopReset.setUTCDate(shopReset.getUTCDate() + 1);
    }

    return shopReset;
  }

  /**
   * Test API connection
   */
  static async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v2/shop`);

      if (!response.ok) {
        log.error(`Fortnite-API.com connection test failed: ${response.status} ${response.statusText}`);
        return false;
      }

      const data = await response.json() as FortniteAPICom_Response;

      if (data.status !== 200) {
        log.error('Fortnite-API.com returned invalid status');
        return false;
      }

      log.info('Fortnite-API.com connection successful');
      log.info(`Current shop date: ${data.data?.date}`);
      return true;
    } catch (error) {
      log.error('Fortnite-API.com connection test failed:', error);
      return false;
    }
  }
}
