import { prisma } from '../database/client';
import { log } from './logger';

/**
 * Utility to check if catalog is stale and needs refresh
 */
export class CatalogFreshnessChecker {
  /**
   * Get Fortnite shop rotation time (daily at 00:00 UTC)
   * This is when Fortnite's item shop resets each day
   */
  static getShopRotationTime(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0); // Next midnight UTC
    return tomorrow;
  }

  /**
   * Get today's date at 00:00 UTC (the current shop rotation period)
   */
  static getTodayUTC(): Date {
    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    return today;
  }

  /**
   * Check if the catalog is stale (outdated)
   * Returns true if:
   * 1. No catalog exists for today
   * 2. Today's catalog has no items
   * 3. Catalog's shopClosesAt time has passed
   */
  static async isCatalogStale(): Promise<{
    isStale: boolean;
    reason?: string;
    catalog?: any;
  }> {
    try {
      const today = this.getTodayUTC();

      // Check if today's catalog exists
      const catalog = await prisma.dailyCatalog.findUnique({
        where: { date: today },
        include: {
          items: {
            include: {
              item: true,
            },
          },
        },
      });

      // No catalog for today = stale
      if (!catalog) {
        log.info('Catalog is stale: No catalog exists for today');
        return {
          isStale: true,
          reason: 'NO_CATALOG_TODAY',
        };
      }

      // Catalog exists but has no items = stale
      if (catalog.items.length === 0) {
        log.info('Catalog is stale: Today\'s catalog has no items');
        return {
          isStale: true,
          reason: 'NO_ITEMS_IN_CATALOG',
          catalog,
        };
      }

      // Check if shop rotation time has passed
      const now = new Date();
      if (now >= catalog.shopClosesAt) {
        log.info('Catalog is stale: Shop rotation time has passed');
        return {
          isStale: true,
          reason: 'SHOP_ROTATION_PASSED',
          catalog,
        };
      }

      // Catalog is fresh
      return {
        isStale: false,
        catalog,
      };
    } catch (error) {
      log.error('Error checking catalog freshness:', error);
      // On error, assume stale to trigger refresh
      return {
        isStale: true,
        reason: 'ERROR_CHECKING',
      };
    }
  }

  /**
   * Get time until next shop rotation
   */
  static getTimeUntilRotation(): number {
    const now = new Date();
    const nextRotation = this.getShopRotationTime();
    return nextRotation.getTime() - now.getTime();
  }

  /**
   * Format time in milliseconds to human readable
   */
  static formatTime(ms: number): string {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  }
}
