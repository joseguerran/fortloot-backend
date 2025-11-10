import { Request, Response } from 'express';
import { ConfigService, CheckoutMode } from '../../services/ConfigService';
import { log } from '../../utils/logger';

export class ConfigController {
  /**
   * Get a configuration value by key
   * GET /api/config/:key
   */
  static async get(req: Request, res: Response): Promise<void> {
    const { key } = req.params;

    const value = await ConfigService.get(key);

    if (value === null) {
      res.status(404).json({
        success: false,
        error: `Configuration key '${key}' not found`
      });
      return;
    }

    res.json({
      success: true,
      data: {
        key,
        value
      }
    });
  }

  /**
   * Set a configuration value
   * PUT /api/config/:key
   */
  static async set(req: Request, res: Response): Promise<void> {
    const { key } = req.params;
    const { value, description } = req.body;

    if (!value) {
      res.status(400).json({
        success: false,
        error: 'Value is required'
      });
      return;
    }

    const config = await ConfigService.set(key, value, description);

    res.json({
      success: true,
      data: config
    });
  }

  /**
   * Get all configurations
   * GET /api/config
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    const configs = await ConfigService.getAll();

    res.json({
      success: true,
      data: configs
    });
  }

  /**
   * Delete a configuration
   * DELETE /api/config/:key
   */
  static async delete(req: Request, res: Response): Promise<void> {
    const { key } = req.params;

    await ConfigService.delete(key);

    res.json({
      success: true,
      message: `Configuration '${key}' deleted successfully`
    });
  }

  /**
   * Get current checkout mode
   * GET /api/config/checkout-mode
   */
  static async getCheckoutMode(req: Request, res: Response): Promise<void> {
    const mode = await ConfigService.getCheckoutMode();

    res.json({
      success: true,
      value: mode,
      checkoutMode: mode // Compatibilidad con frontend
    });
  }

  /**
   * Set checkout mode
   * PUT /api/config/checkout-mode
   */
  static async setCheckoutMode(req: Request, res: Response): Promise<void> {
    const { value } = req.body;

    if (!value) {
      res.status(400).json({
        success: false,
        error: 'Value is required'
      });
      return;
    }

    // Validate checkout mode
    if (!['whatsapp', 'wizard', 'bot-wizard'].includes(value)) {
      res.status(400).json({
        success: false,
        error: 'Invalid checkout mode. Must be: whatsapp, wizard, or bot-wizard'
      });
      return;
    }

    const config = await ConfigService.setCheckoutMode(value as CheckoutMode);

    log.info(`Checkout mode updated to: ${value} by user ${(req as any).user?.email || 'unknown'}`);

    res.json({
      success: true,
      data: config,
      value: config.value
    });
  }

  /**
   * Get manual checkout enabled setting
   * GET /api/config/manual-checkout
   */
  static async getManualCheckout(req: Request, res: Response): Promise<void> {
    const enabled = await ConfigService.getManualCheckoutEnabled();

    res.json({
      success: true,
      enabled,
      value: enabled // Compatibilidad
    });
  }

  /**
   * Set manual checkout enabled setting
   * PUT /api/config/manual-checkout
   */
  static async setManualCheckout(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'enabled must be a boolean value'
      });
      return;
    }

    const config = await ConfigService.setManualCheckoutEnabled(enabled);

    log.info(`Manual checkout enabled updated to: ${enabled} by user ${(req as any).user?.email || 'unknown'}`);

    res.json({
      success: true,
      data: config,
      enabled,
      value: enabled
    });
  }
}
