import { prisma } from '../database/client';
import { Config } from '@prisma/client';
import { log } from '../utils/logger';

export type CheckoutMode = 'whatsapp' | 'wizard' | 'bot-wizard';

export class ConfigService {
  /**
   * Get a configuration value by key
   */
  static async get(key: string): Promise<string | null> {
    try {
      const config = await prisma.config.findUnique({
        where: { key }
      });

      return config?.value || null;
    } catch (error) {
      log.error(`Error fetching config key ${key}:`, error);
      throw new Error('Failed to fetch configuration');
    }
  }

  /**
   * Set a configuration value
   */
  static async set(key: string, value: string, description?: string): Promise<Config> {
    try {
      const config = await prisma.config.upsert({
        where: { key },
        update: {
          value,
          description: description || undefined
        },
        create: {
          key,
          value,
          description
        }
      });

      log.info(`Configuration updated: ${key} = ${value}`);
      return config;
    } catch (error) {
      log.error(`Error setting config key ${key}:`, error);
      throw new Error('Failed to set configuration');
    }
  }

  /**
   * Get all configurations
   */
  static async getAll(): Promise<Config[]> {
    try {
      const configs = await prisma.config.findMany({
        orderBy: { key: 'asc' }
      });

      return configs;
    } catch (error) {
      log.error('Error fetching all configs:', error);
      throw new Error('Failed to fetch configurations');
    }
  }

  /**
   * Delete a configuration
   */
  static async delete(key: string): Promise<void> {
    try {
      await prisma.config.delete({
        where: { key }
      });

      log.info(`Configuration deleted: ${key}`);
    } catch (error) {
      log.error(`Error deleting config key ${key}:`, error);
      throw new Error('Failed to delete configuration');
    }
  }

  /**
   * Get the current checkout mode
   * Returns 'whatsapp' by default if not configured
   */
  static async getCheckoutMode(): Promise<CheckoutMode> {
    try {
      const value = await this.get('checkout_mode');

      // Validate and return checkout mode
      if (value === 'wizard' || value === 'bot-wizard') {
        return value;
      }

      // Default to whatsapp for any other value or null
      return 'whatsapp';
    } catch (error) {
      log.error('Error fetching checkout mode:', error);
      // Always fallback to whatsapp on error
      return 'whatsapp';
    }
  }

  /**
   * Set the checkout mode
   */
  static async setCheckoutMode(mode: CheckoutMode): Promise<Config> {
    try {
      // Validate mode
      if (!['whatsapp', 'wizard', 'bot-wizard'].includes(mode)) {
        throw new Error(`Invalid checkout mode: ${mode}. Must be whatsapp, wizard, or bot-wizard`);
      }

      const config = await this.set(
        'checkout_mode',
        mode,
        'Checkout mode: whatsapp (manual), wizard (new checkout), or bot-wizard (future bot checkout)'
      );

      log.info(`Checkout mode changed to: ${mode}`);
      return config;
    } catch (error) {
      log.error('Error setting checkout mode:', error);
      throw error;
    }
  }

  /**
   * Get whether manual checkout is enabled
   * Returns false by default if not configured
   */
  static async getManualCheckoutEnabled(): Promise<boolean> {
    try {
      const value = await this.get('manual_checkout_enabled');
      return value === 'true';
    } catch (error) {
      log.error('Error fetching manual checkout enabled:', error);
      return false;
    }
  }

  /**
   * Set whether manual checkout is enabled
   */
  static async setManualCheckoutEnabled(enabled: boolean): Promise<Config> {
    try {
      const config = await this.set(
        'manual_checkout_enabled',
        enabled.toString(),
        'Enable manual checkout flow for items that require manual processing'
      );

      log.info(`Manual checkout enabled changed to: ${enabled}`);
      return config;
    } catch (error) {
      log.error('Error setting manual checkout enabled:', error);
      throw error;
    }
  }

  /**
   * Get whether WhatsApp notifications are enabled
   * Returns false by default if not configured
   */
  static async isWhatsAppEnabled(): Promise<boolean> {
    try {
      const value = await this.get('whatsapp_notifications_enabled');
      return value === 'true';
    } catch (error) {
      log.error('Error fetching WhatsApp enabled status:', error);
      return false;
    }
  }

  /**
   * Set whether WhatsApp notifications are enabled
   */
  static async setWhatsAppEnabled(enabled: boolean): Promise<Config> {
    try {
      const config = await this.set(
        'whatsapp_notifications_enabled',
        enabled.toString(),
        'Enable WhatsApp notifications to admin for orders and payments'
      );

      log.info(`WhatsApp notifications enabled changed to: ${enabled}`);
      return config;
    } catch (error) {
      log.error('Error setting WhatsApp enabled:', error);
      throw error;
    }
  }
}
