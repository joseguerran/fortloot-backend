import { Request, Response } from 'express';
import {
  PaymentMethodConfigService,
  PaymentMethodConfigType,
} from '../../services/PaymentMethodConfigService';
import { log } from '../../utils/logger';

export class PaymentMethodConfigController {
  /**
   * GET /api/payment-methods/:id/configs
   * Get all configurations for a payment method
   */
  static async getConfigs(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const configs = await PaymentMethodConfigService.getConfigs(id);

      res.json({
        success: true,
        data: configs,
      });
    } catch (error: any) {
      log.error('Error fetching payment method configs:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch payment method configs',
      });
    }
  }

  /**
   * GET /api/payment-methods/:id/configs/:type
   * Get a specific configuration by type
   */
  static async getConfigByType(req: Request, res: Response) {
    try {
      const { id, type } = req.params;

      if (!isValidConfigType(type)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Invalid config type: ${type}`,
        });
      }

      const config = await PaymentMethodConfigService.getConfigByType(
        id,
        type as PaymentMethodConfigType
      );

      if (!config) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Config type '${type}' not found for this payment method`,
        });
      }

      res.json({
        success: true,
        data: config,
      });
    } catch (error: any) {
      log.error('Error fetching payment method config:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch payment method config',
      });
    }
  }

  /**
   * PUT /api/admin/payment-methods/:id/configs/:type
   * Create or update a configuration
   */
  static async upsertConfig(req: Request, res: Response) {
    try {
      const { id, type } = req.params;
      const { config, enabled } = req.body;

      if (!isValidConfigType(type)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Invalid config type: ${type}`,
        });
      }

      if (!config || typeof config !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'config object is required',
        });
      }

      // Validate config based on type
      const validationError = validateConfigByType(type as PaymentMethodConfigType, config);
      if (validationError) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: validationError,
        });
      }

      const result = await PaymentMethodConfigService.upsertConfig(
        id,
        type as PaymentMethodConfigType,
        config,
        enabled !== undefined ? enabled : true
      );

      res.json({
        success: true,
        data: result,
        message: `Config '${type}' saved successfully`,
      });
    } catch (error: any) {
      log.error('Error upserting payment method config:', error);

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
        message: 'Failed to save payment method config',
      });
    }
  }

  /**
   * DELETE /api/admin/payment-methods/:id/configs/:type
   * Delete a configuration
   */
  static async deleteConfig(req: Request, res: Response) {
    try {
      const { id, type } = req.params;

      if (!isValidConfigType(type)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Invalid config type: ${type}`,
        });
      }

      await PaymentMethodConfigService.deleteConfig(id, type as PaymentMethodConfigType);

      res.json({
        success: true,
        message: `Config '${type}' deleted successfully`,
      });
    } catch (error: any) {
      log.error('Error deleting payment method config:', error);

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
        message: 'Failed to delete payment method config',
      });
    }
  }

  /**
   * PATCH /api/admin/payment-methods/:id/configs/:type/toggle
   * Enable or disable a configuration
   */
  static async toggleConfig(req: Request, res: Response) {
    try {
      const { id, type } = req.params;
      const { enabled } = req.body;

      if (!isValidConfigType(type)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Invalid config type: ${type}`,
        });
      }

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'enabled (boolean) is required',
        });
      }

      const config = await PaymentMethodConfigService.toggleConfig(
        id,
        type as PaymentMethodConfigType,
        enabled
      );

      res.json({
        success: true,
        data: config,
        message: `Config '${type}' ${enabled ? 'enabled' : 'disabled'} successfully`,
      });
    } catch (error: any) {
      log.error('Error toggling payment method config:', error);

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
        message: 'Failed to toggle payment method config',
      });
    }
  }

  /**
   * GET /api/payment-methods/:id/price
   * Apply all configs to a price and get the final result (public endpoint)
   */
  static async applyPrice(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { priceUsd } = req.query;

      if (!priceUsd || isNaN(Number(priceUsd))) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'priceUsd (number) query parameter is required',
        });
      }

      const result = await PaymentMethodConfigService.applyConfigsToPrice(id, Number(priceUsd));

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      log.error('Error applying price configs:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to apply price configs',
      });
    }
  }

  /**
   * GET /api/payment-methods/:id/with-configs
   * Get payment method with all its configurations
   */
  static async getWithConfigs(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const paymentMethod = await PaymentMethodConfigService.getPaymentMethodWithConfigs(id);

      if (!paymentMethod) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Payment method not found',
        });
      }

      res.json({
        success: true,
        data: paymentMethod,
      });
    } catch (error: any) {
      log.error('Error fetching payment method with configs:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch payment method with configs',
      });
    }
  }

  /**
   * GET /api/payment-methods/slug/:slug/with-configs
   * Get payment method with all its configurations by slug
   */
  static async getWithConfigsBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const paymentMethod = await PaymentMethodConfigService.getPaymentMethodWithConfigsBySlug(slug);

      if (!paymentMethod) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Payment method not found',
        });
      }

      res.json({
        success: true,
        data: paymentMethod,
      });
    } catch (error: any) {
      log.error('Error fetching payment method with configs by slug:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch payment method with configs',
      });
    }
  }
}

// Helper function to validate config type
function isValidConfigType(type: string): boolean {
  const validTypes: PaymentMethodConfigType[] = [
    'CURRENCY_CONVERSION',
    'FEE',
    'COUNTRY_RESTRICTION',
    'AMOUNT_LIMIT',
  ];
  return validTypes.includes(type as PaymentMethodConfigType);
}

// Helper function to validate config data based on type
function validateConfigByType(type: PaymentMethodConfigType, config: any): string | null {
  switch (type) {
    case 'CURRENCY_CONVERSION':
      if (!config.targetCurrency || typeof config.targetCurrency !== 'string') {
        return 'targetCurrency (string) is required for CURRENCY_CONVERSION';
      }
      if (!config.rateProvider || typeof config.rateProvider !== 'string') {
        return 'rateProvider (string) is required for CURRENCY_CONVERSION';
      }
      if (config.markup !== undefined && typeof config.markup !== 'number') {
        return 'markup must be a number';
      }
      if (config.cacheTTLMin !== undefined && typeof config.cacheTTLMin !== 'number') {
        return 'cacheTTLMin must be a number';
      }
      break;

    case 'FEE':
      if (!config.feeType || !['PERCENTAGE', 'FIXED', 'COMPOUND'].includes(config.feeType)) {
        return 'feeType must be "PERCENTAGE", "FIXED", or "COMPOUND"';
      }
      if (config.feeType === 'COMPOUND') {
        // Para COMPOUND se requiere porcentaje y monto fijo
        if (config.feeValue === undefined || typeof config.feeValue !== 'number') {
          return 'feeValue (percentage) is required for COMPOUND fee';
        }
        if (config.fixedFee === undefined || typeof config.fixedFee !== 'number') {
          return 'fixedFee is required for COMPOUND fee';
        }
      } else if (config.feeType === 'FIXED') {
        // Para FIXED se usa fixedFee o feeValue
        if ((config.fixedFee === undefined || typeof config.fixedFee !== 'number') &&
            (config.feeValue === undefined || typeof config.feeValue !== 'number')) {
          return 'fixedFee or feeValue (number) is required for FIXED fee';
        }
      } else {
        // Para PERCENTAGE solo se requiere feeValue
        if (config.feeValue === undefined || typeof config.feeValue !== 'number') {
          return 'feeValue (number) is required for FEE';
        }
      }
      break;

    case 'COUNTRY_RESTRICTION':
      if (!Array.isArray(config.countries)) {
        return 'countries (array) is required for COUNTRY_RESTRICTION';
      }
      if (!config.mode || !['whitelist', 'blacklist'].includes(config.mode)) {
        return 'mode must be "whitelist" or "blacklist"';
      }
      break;

    case 'AMOUNT_LIMIT':
      if (config.minAmount !== undefined && typeof config.minAmount !== 'number') {
        return 'minAmount must be a number';
      }
      if (config.maxAmount !== undefined && typeof config.maxAmount !== 'number') {
        return 'maxAmount must be a number';
      }
      if (config.minAmount === undefined && config.maxAmount === undefined) {
        return 'At least one of minAmount or maxAmount is required';
      }
      break;
  }

  return null;
}
