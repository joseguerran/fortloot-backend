import { Request, Response } from 'express';
import { PaymentMethodService } from '../../services/PaymentMethodService';
import { log } from '../../utils/logger';

export class PaymentMethodController {
  /**
   * GET /api/payment-methods
   * Get all payment methods (public endpoint)
   */
  static async getAll(req: Request, res: Response) {
    try {
      const onlyActive = req.query.active === 'true';
      const methods = await PaymentMethodService.getAll(onlyActive);

      res.json({
        success: true,
        data: methods,
      });
    } catch (error) {
      log.error('Error fetching payment methods:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch payment methods',
      });
    }
  }

  /**
   * GET /api/payment-methods/:id
   * Get payment method by ID (public endpoint)
   */
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const method = await PaymentMethodService.getById(id);

      if (!method) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Payment method not found',
        });
      }

      res.json({
        success: true,
        data: method,
      });
    } catch (error) {
      log.error('Error fetching payment method:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch payment method',
      });
    }
  }

  /**
   * GET /api/payment-methods/slug/:slug
   * Get payment method by slug (public endpoint)
   */
  static async getBySlug(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      const method = await PaymentMethodService.getBySlug(slug);

      if (!method) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Payment method not found',
        });
      }

      res.json({
        success: true,
        data: method,
      });
    } catch (error) {
      log.error('Error fetching payment method:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch payment method',
      });
    }
  }

  /**
   * POST /api/admin/payment-methods
   * Create a new payment method (admin only)
   */
  static async create(req: Request, res: Response) {
    try {
      const {
        name,
        slug,
        description,
        icon,
        isActive,
        displayOrder,
        instructions,
        accountInfo,
        metadata,
      } = req.body;

      // Validation
      if (!name || !slug) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'name and slug are required',
        });
      }

      const method = await PaymentMethodService.create({
        name,
        slug,
        description,
        icon,
        isActive,
        displayOrder,
        instructions,
        accountInfo,
        metadata,
      });

      res.status(201).json({
        success: true,
        data: method,
        message: 'Payment method created successfully',
      });
    } catch (error: any) {
      log.error('Error creating payment method:', error);

      if (error.message?.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: 'CONFLICT',
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to create payment method',
      });
    }
  }

  /**
   * PATCH /api/admin/payment-methods/:id
   * Update a payment method (admin only)
   */
  static async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        slug,
        description,
        icon,
        isActive,
        displayOrder,
        instructions,
        accountInfo,
        metadata,
      } = req.body;

      const method = await PaymentMethodService.update(id, {
        name,
        slug,
        description,
        icon,
        isActive,
        displayOrder,
        instructions,
        accountInfo,
        metadata,
      });

      res.json({
        success: true,
        data: method,
        message: 'Payment method updated successfully',
      });
    } catch (error: any) {
      log.error('Error updating payment method:', error);

      if (error.message?.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: error.message,
        });
      }

      if (error.message?.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: 'CONFLICT',
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to update payment method',
      });
    }
  }

  /**
   * DELETE /api/admin/payment-methods/:id
   * Delete a payment method (admin only)
   */
  static async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await PaymentMethodService.delete(id);

      res.json({
        success: true,
        message: 'Payment method deleted successfully',
      });
    } catch (error: any) {
      log.error('Error deleting payment method:', error);

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
        message: 'Failed to delete payment method',
      });
    }
  }

  /**
   * PATCH /api/admin/payment-methods/:id/toggle
   * Toggle payment method active status (admin only)
   */
  static async toggleActive(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const method = await PaymentMethodService.toggleActive(id);

      res.json({
        success: true,
        data: method,
        message: `Payment method ${method.isActive ? 'activated' : 'deactivated'} successfully`,
      });
    } catch (error: any) {
      log.error('Error toggling payment method:', error);

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
        message: 'Failed to toggle payment method',
      });
    }
  }

  /**
   * POST /api/admin/payment-methods/reorder
   * Reorder payment methods (admin only)
   */
  static async reorder(req: Request, res: Response) {
    try {
      const { items } = req.body;

      if (!Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'items must be an array',
        });
      }

      await PaymentMethodService.reorder(items);

      res.json({
        success: true,
        message: 'Payment methods reordered successfully',
      });
    } catch (error) {
      log.error('Error reordering payment methods:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to reorder payment methods',
      });
    }
  }
}
