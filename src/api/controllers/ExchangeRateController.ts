import { Request, Response } from 'express';
import { ExchangeRateService } from '../../services/ExchangeRateService';
import { PaymentMethodConfigService, CurrencyConversionConfig } from '../../services/PaymentMethodConfigService';
import { log } from '../../utils/logger';
import { prisma } from '../../database/client';

export class ExchangeRateController {
  /**
   * GET /api/exchange-rates/:currency
   * Get current exchange rate for a currency (public endpoint)
   * Returns the rate only if there's an active payment method with currency conversion config
   */
  static async getRate(req: Request, res: Response) {
    try {
      const { currency } = req.params;

      // Find a payment method with this currency conversion config
      const config = await findCurrencyConfig(currency);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `No active currency conversion found for ${currency}`,
        });
      }

      const rateResult = await ExchangeRateService.getRate(currency, config);

      if (!rateResult) {
        return res.status(503).json({
          success: false,
          error: 'RATE_UNAVAILABLE',
          message: `Exchange rate for ${currency} is currently unavailable`,
        });
      }

      res.json({
        success: true,
        data: {
          currency,
          rate: rateResult.rate,
          source: rateResult.source,
          validUntil: rateResult.expiresAt,
          isManual: rateResult.isManual,
        },
      });
    } catch (error: any) {
      log.error('Error fetching exchange rate:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch exchange rate',
      });
    }
  }

  /**
   * GET /api/admin/exchange-rates/:currency/info
   * Get detailed rate info including raw rate, manual override, cache status (admin only)
   */
  static async getRateInfo(req: Request, res: Response) {
    try {
      const { currency } = req.params;

      const info = await ExchangeRateService.getRateInfo(currency);

      if (!info) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `No rate information found for ${currency}`,
        });
      }

      res.json({
        success: true,
        data: info,
      });
    } catch (error: any) {
      log.error('Error fetching exchange rate info:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch exchange rate info',
      });
    }
  }

  /**
   * POST /api/admin/exchange-rates/:currency/fetch
   * Force refresh rate from provider (admin only)
   */
  static async fetchRate(req: Request, res: Response) {
    try {
      const { currency } = req.params;

      // Find config for this currency
      const config = await findCurrencyConfig(currency);

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `No currency conversion config found for ${currency}`,
        });
      }

      const rateResult = await ExchangeRateService.fetchRate(currency, config);

      res.json({
        success: true,
        data: {
          currency,
          rate: rateResult.rate,
          rawRate: rateResult.rawRate,
          source: rateResult.source,
          fetchedAt: rateResult.fetchedAt,
          expiresAt: rateResult.expiresAt,
        },
        message: `Rate for ${currency} refreshed successfully`,
      });
    } catch (error: any) {
      log.error('Error fetching exchange rate:', error);

      // Check if it's a provider error
      if (error.message?.includes('Binance') || error.message?.includes('No P2P')) {
        return res.status(503).json({
          success: false,
          error: 'PROVIDER_ERROR',
          message: `Failed to fetch rate from provider: ${error.message}`,
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch exchange rate',
      });
    }
  }

  /**
   * DELETE /api/admin/exchange-rates/:currency/cache
   * Invalidate cache for a currency (admin only)
   */
  static async invalidateCache(req: Request, res: Response) {
    try {
      const { currency } = req.params;

      await ExchangeRateService.invalidateCache(currency);

      res.json({
        success: true,
        message: `Cache for ${currency} invalidated successfully`,
      });
    } catch (error: any) {
      log.error('Error invalidating exchange rate cache:', error);

      if (error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to invalidate cache',
      });
    }
  }

  /**
   * PUT /api/admin/exchange-rates/:currency/manual
   * Set manual rate override (admin only)
   */
  static async setManualRate(req: Request, res: Response) {
    try {
      const { currency } = req.params;
      const { rate } = req.body;
      const adminUser = (req as any).user;

      if (rate === undefined || typeof rate !== 'number' || rate <= 0) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'rate (positive number) is required',
        });
      }

      const adminUsername = adminUser?.username || adminUser?.email || 'unknown';
      const result = await ExchangeRateService.setManualRate(currency, rate, adminUsername);

      res.json({
        success: true,
        data: {
          currency,
          manualRate: result.manualRate,
          manualSetBy: result.manualSetBy,
          manualSetAt: result.manualSetAt,
        },
        message: `Manual rate for ${currency} set to ${rate}`,
      });
    } catch (error: any) {
      log.error('Error setting manual rate:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to set manual rate',
      });
    }
  }

  /**
   * DELETE /api/admin/exchange-rates/:currency/manual
   * Clear manual rate override (admin only)
   */
  static async clearManualRate(req: Request, res: Response) {
    try {
      const { currency } = req.params;

      await ExchangeRateService.clearManualRate(currency);

      res.json({
        success: true,
        message: `Manual rate for ${currency} cleared`,
      });
    } catch (error: any) {
      log.error('Error clearing manual rate:', error);

      if (error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to clear manual rate',
      });
    }
  }

  /**
   * POST /api/admin/exchange-rates/:currency/test
   * Test Binance P2P connection for a currency (admin only)
   */
  static async testConnection(req: Request, res: Response) {
    try {
      const { currency } = req.params;
      const { bankFilter } = req.body;

      const success = await ExchangeRateService.testBinanceConnection(currency, bankFilter);

      if (success) {
        res.json({
          success: true,
          message: `Binance P2P connection test successful for ${currency}`,
        });
      } else {
        res.status(503).json({
          success: false,
          error: 'CONNECTION_FAILED',
          message: `Binance P2P connection test failed for ${currency}`,
        });
      }
    } catch (error: any) {
      log.error('Error testing Binance connection:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to test connection',
      });
    }
  }

  /**
   * GET /api/admin/exchange-rates
   * List all cached exchange rates (admin only)
   */
  static async listRates(req: Request, res: Response) {
    try {
      const rates = await prisma.exchangeRateCache.findMany({
        orderBy: { currency: 'asc' },
      });

      const now = new Date();
      const ratesWithStatus = rates.map((rate) => ({
        ...rate,
        isExpired: !rate.manualRate && now > rate.expiresAt,
        isManual: rate.manualRate !== null,
      }));

      res.json({
        success: true,
        data: ratesWithStatus,
      });
    } catch (error: any) {
      log.error('Error listing exchange rates:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list exchange rates',
      });
    }
  }
}

// Helper function to find currency conversion config for a currency
async function findCurrencyConfig(currency: string): Promise<CurrencyConversionConfig | null> {
  try {
    // Find all payment method configs with CURRENCY_CONVERSION type
    const configs = await prisma.paymentMethodConfig.findMany({
      where: {
        type: 'CURRENCY_CONVERSION',
        enabled: true,
      },
      include: {
        paymentMethod: true,
      },
    });

    // Find one that matches the currency
    for (const config of configs) {
      const configData = config.config as any;
      if (configData?.targetCurrency === currency) {
        return configData as CurrencyConversionConfig;
      }
    }

    return null;
  } catch (error) {
    log.error(`Error finding currency config for ${currency}:`, error);
    return null;
  }
}
