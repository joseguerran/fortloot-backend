import { prisma } from '../database/client';
import { ExchangeRateCache } from '@prisma/client';
import { log } from '../utils/logger';
import type { CurrencyConversionConfig } from './PaymentMethodConfigService';

// Interfaces para Binance P2P API
interface BinanceP2PAdvertisement {
  adv: {
    price: string;
    minSingleTransAmount: string;
    maxSingleTransAmount: string;
    tradableQuantity: string;
  };
  advertiser: {
    nickName: string;
    userNo: string;
  };
}

interface BinanceP2PResponse {
  code: string;
  message: string | null;
  messageDetail: string | null;
  data: BinanceP2PAdvertisement[];
  total: number;
  success: boolean;
}

// Resultado de obtener tasa
export interface RateResult {
  rate: number;
  rawRate: number;
  source: string;
  fetchedAt: Date;
  expiresAt: Date;
  isManual: boolean;
}

export class ExchangeRateService {
  private static readonly BINANCE_P2P_URL =
    'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

  /**
   * Obtener tasa de cambio (con cache on-demand)
   */
  static async getRate(
    currency: string,
    config: CurrencyConversionConfig
  ): Promise<RateResult | null> {
    try {
      // 1. Primero verificar si hay tasa manual establecida
      const cached = await this.getCachedRate(currency);

      if (cached?.manualRate !== null && cached?.manualRate !== undefined) {
        log.info(`Using manual rate for ${currency}: ${cached.manualRate}`);
        return {
          rate: cached.manualRate,
          rawRate: cached.manualRate,
          source: 'manual',
          fetchedAt: cached.manualSetAt || cached.fetchedAt,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Manual rates don't expire (24h)
          isManual: true,
        };
      }

      // 2. Verificar si hay cache válido
      if (cached && new Date() < cached.expiresAt) {
        log.info(`Using cached rate for ${currency}: ${cached.rate}`);
        return {
          rate: cached.rate,
          rawRate: cached.rawRate || cached.rate,
          source: cached.source,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
          isManual: false,
        };
      }

      // 3. Cache expirado o no existe - obtener nueva tasa
      log.info(`Cache miss or expired for ${currency}, fetching fresh rate...`);
      return await this.fetchAndCacheRate(currency, config);
    } catch (error) {
      log.error(`Error getting rate for ${currency}:`, error);

      // Fallback: intentar usar cache expirado si existe
      const staleCache = await this.getCachedRate(currency);
      if (staleCache) {
        log.warn(`Using stale cached rate for ${currency} due to error`);
        return {
          rate: staleCache.rate,
          rawRate: staleCache.rawRate || staleCache.rate,
          source: `${staleCache.source}_stale`,
          fetchedAt: staleCache.fetchedAt,
          expiresAt: staleCache.expiresAt,
          isManual: false,
        };
      }

      return null;
    }
  }

  /**
   * Forzar actualización de tasa desde el proveedor
   */
  static async fetchRate(
    currency: string,
    config: CurrencyConversionConfig
  ): Promise<RateResult> {
    return await this.fetchAndCacheRate(currency, config);
  }

  /**
   * Obtener tasa cacheada de la base de datos
   */
  static async getCachedRate(currency: string): Promise<ExchangeRateCache | null> {
    try {
      const cached = await prisma.exchangeRateCache.findUnique({
        where: { currency },
      });

      return cached;
    } catch (error) {
      log.error(`Error fetching cached rate for ${currency}:`, error);
      return null;
    }
  }

  /**
   * Obtener información completa de tasa para administración
   */
  static async getRateInfo(currency: string): Promise<{
    currentRate: number | null;
    rawRate: number | null;
    source: string | null;
    manualRate: number | null;
    manualSetBy: string | null;
    manualSetAt: Date | null;
    fetchedAt: Date | null;
    expiresAt: Date | null;
    isExpired: boolean;
    isManual: boolean;
  } | null> {
    const cached = await this.getCachedRate(currency);

    if (!cached) {
      return null;
    }

    const isManual = cached.manualRate !== null;
    const isExpired = !isManual && new Date() > cached.expiresAt;

    return {
      currentRate: isManual ? cached.manualRate : cached.rate,
      rawRate: cached.rawRate,
      source: isManual ? 'manual' : cached.source,
      manualRate: cached.manualRate,
      manualSetBy: cached.manualSetBy,
      manualSetAt: cached.manualSetAt,
      fetchedAt: cached.fetchedAt,
      expiresAt: cached.expiresAt,
      isExpired,
      isManual,
    };
  }

  /**
   * Establecer tasa manual (override)
   */
  static async setManualRate(
    currency: string,
    rate: number,
    adminUsername: string
  ): Promise<ExchangeRateCache> {
    try {
      const now = new Date();

      const result = await prisma.exchangeRateCache.upsert({
        where: { currency },
        update: {
          manualRate: rate,
          manualSetBy: adminUsername,
          manualSetAt: now,
        },
        create: {
          currency,
          rate: rate,
          rawRate: rate,
          source: 'manual',
          manualRate: rate,
          manualSetBy: adminUsername,
          manualSetAt: now,
          fetchedAt: now,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24h
        },
      });

      log.info(`Manual rate set for ${currency}: ${rate} by ${adminUsername}`);
      return result;
    } catch (error) {
      log.error(`Error setting manual rate for ${currency}:`, error);
      throw new Error('Failed to set manual rate');
    }
  }

  /**
   * Quitar tasa manual (volver a usar proveedor)
   */
  static async clearManualRate(currency: string): Promise<void> {
    try {
      await prisma.exchangeRateCache.update({
        where: { currency },
        data: {
          manualRate: null,
          manualSetBy: null,
          manualSetAt: null,
        },
      });

      log.info(`Manual rate cleared for ${currency}`);
    } catch (error) {
      log.error(`Error clearing manual rate for ${currency}:`, error);
      throw new Error('Failed to clear manual rate');
    }
  }

  /**
   * Invalidar cache (forzar nuevo fetch en próxima solicitud)
   */
  static async invalidateCache(currency: string): Promise<void> {
    try {
      await prisma.exchangeRateCache.update({
        where: { currency },
        data: {
          expiresAt: new Date(0), // Expira inmediatamente
        },
      });

      log.info(`Cache invalidated for ${currency}`);
    } catch (error) {
      log.error(`Error invalidating cache for ${currency}:`, error);
      throw new Error('Failed to invalidate cache');
    }
  }

  /**
   * Obtener tasa desde proveedor y guardar en cache
   */
  private static async fetchAndCacheRate(
    currency: string,
    config: CurrencyConversionConfig
  ): Promise<RateResult> {
    let rawRate: number;

    // Obtener tasa del proveedor correspondiente
    switch (config.rateProvider) {
      case 'binance_p2p':
        rawRate = await this.fetchFromBinanceP2P(currency, config.bankFilter);
        break;
      case 'manual':
        // Para manual, usar la tasa almacenada o fallar
        const cached = await this.getCachedRate(currency);
        if (cached?.manualRate) {
          rawRate = cached.manualRate;
        } else {
          throw new Error(`No manual rate set for ${currency}`);
        }
        break;
      default:
        throw new Error(`Unknown rate provider: ${config.rateProvider}`);
    }

    // Calcular tasa final con markup
    const finalRate = rawRate + config.markup;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.cacheTTLMin * 60 * 1000);

    // Guardar en cache
    await prisma.exchangeRateCache.upsert({
      where: { currency },
      update: {
        rate: finalRate,
        rawRate,
        source: config.rateProvider,
        fetchedAt: now,
        expiresAt,
      },
      create: {
        currency,
        rate: finalRate,
        rawRate,
        source: config.rateProvider,
        fetchedAt: now,
        expiresAt,
      },
    });

    log.info(
      `Rate fetched and cached for ${currency}: raw=${rawRate}, final=${finalRate}, expires=${expiresAt.toISOString()}`
    );

    return {
      rate: finalRate,
      rawRate,
      source: config.rateProvider,
      fetchedAt: now,
      expiresAt,
      isManual: false,
    };
  }

  /**
   * Obtener tasa desde Binance P2P
   */
  private static async fetchFromBinanceP2P(
    currency: string,
    bankFilter?: string
  ): Promise<number> {
    try {
      const payload = {
        asset: 'USDT',
        fiat: currency,
        tradeType: 'SELL',
        page: 1,
        rows: 20,
        payTypes: bankFilter ? [bankFilter] : [],
        publisherType: null,
      };

      log.info(`Fetching Binance P2P rate for ${currency} with filter: ${bankFilter || 'none'}`);

      const response = await fetch(this.BINANCE_P2P_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'User-Agent': 'FortLoot/1.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Binance API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as BinanceP2PResponse;

      if (!data.data || data.data.length === 0) {
        throw new Error(`No P2P advertisements found for ${currency}`);
      }

      // Extraer precios de la primera página
      const prices = data.data.map((ad) => parseFloat(ad.adv.price));
      const minRate = Math.min(...prices);
      const maxRate = Math.max(...prices);

      // Calcular promedio entre min y max
      const averageRate = (minRate + maxRate) / 2;

      log.info(
        `Binance P2P rates for ${currency}: min=${minRate}, max=${maxRate}, avg=${averageRate}, ads=${data.data.length}`
      );

      return parseFloat(averageRate.toFixed(2));
    } catch (error) {
      log.error(`Error fetching from Binance P2P for ${currency}:`, error);
      throw error;
    }
  }

  /**
   * Test de conexión con Binance P2P
   */
  static async testBinanceConnection(currency: string, bankFilter?: string): Promise<boolean> {
    try {
      await this.fetchFromBinanceP2P(currency, bankFilter);
      return true;
    } catch (error) {
      log.error('Binance P2P connection test failed:', error);
      return false;
    }
  }
}
