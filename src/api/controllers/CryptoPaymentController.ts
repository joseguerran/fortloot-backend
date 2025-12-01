import { Request, Response } from 'express';
import { CryptomusService } from '../../services/CryptomusService';
import { ConfigService } from '../../services/ConfigService';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';

export class CryptoPaymentController {
  /**
   * POST /api/crypto/create-invoice
   * Create a Cryptomus invoice for an order (public endpoint)
   */
  static async createInvoice(req: Request, res: Response) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'orderId is required',
        });
      }

      // Check if Cryptomus is configured
      if (!CryptomusService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Crypto payments are not configured',
        });
      }

      const result = await CryptomusService.createPaymentForOrder(orderId);

      res.json({
        success: true,
        data: {
          paymentUrl: result.paymentUrl,
          cryptoPaymentId: result.cryptoPayment.id,
          expiresAt: result.cryptoPayment.expiresAt,
        },
      });
    } catch (error: any) {
      log.error('Error creating crypto invoice:', error);

      if (error.message === 'Order not found') {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Order not found',
        });
      }

      if (error.message?.includes('already has a crypto payment')) {
        return res.status(409).json({
          success: false,
          error: 'CONFLICT',
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to create crypto invoice',
      });
    }
  }

  /**
   * GET /api/crypto/status/:orderId
   * Get crypto payment status for an order (public endpoint)
   * If payment is expired, automatically creates a new one
   */
  static async getStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      let cryptoPayment = await CryptomusService.getByOrderId(orderId);

      if (!cryptoPayment) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Crypto payment not found for this order',
        });
      }

      // Check if payment is expired and should be renewed
      const isExpired = cryptoPayment.status === 'PENDING' &&
                        cryptoPayment.expiresAt &&
                        new Date(cryptoPayment.expiresAt) <= new Date();

      if (isExpired) {
        log.info(`CryptoPayment ${cryptoPayment.id} expired, creating new invoice for order ${orderId}`);

        // Delete the expired payment and create a new one
        try {
          const result = await CryptomusService.createPaymentForOrder(orderId);
          cryptoPayment = result.cryptoPayment;
          log.info(`New CryptoPayment created: ${cryptoPayment.id} for order ${orderId}`);
        } catch (renewError: any) {
          log.error('Error renewing expired crypto payment:', renewError);
          // Return the expired payment data anyway so frontend can show expired status
        }
      }

      res.json({
        success: true,
        data: {
          id: cryptoPayment.id,
          status: cryptoPayment.status,
          amount: cryptoPayment.amount,
          paidAmount: cryptoPayment.paidAmount,
          cryptoCurrency: cryptoPayment.cryptoCurrency,
          network: cryptoPayment.network,
          txHash: cryptoPayment.txHash,
          paymentUrl: cryptoPayment.paymentUrl,
          expiresAt: cryptoPayment.expiresAt,
          paidAt: cryptoPayment.paidAt,
        },
      });
    } catch (error) {
      log.error('Error getting crypto payment status:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get crypto payment status',
      });
    }
  }

  /**
   * GET /api/crypto/check-availability
   * Check if crypto payments are available (public endpoint)
   * Checks both: API keys configured AND admin setting enabled
   */
  static async checkAvailability(req: Request, res: Response) {
    try {
      const isConfigured = CryptomusService.isConfigured();
      const isEnabled = await ConfigService.isCryptoPaymentsEnabled();

      // Both must be true for crypto to be available
      const isAvailable = isConfigured && isEnabled;

      res.json({
        success: true,
        data: {
          available: isAvailable,
          currencies: isAvailable ? ['USDT', 'USDC'] : [],
        },
      });
    } catch (error) {
      log.error('Error checking crypto availability:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to check crypto availability',
      });
    }
  }

  /**
   * GET /api/admin/crypto/payments
   * Get all crypto payments (admin endpoint)
   */
  static async getAllPayments(req: Request, res: Response) {
    try {
      const { status, limit, offset } = req.query;

      const result = await CryptomusService.getAll({
        status: status as any,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json({
        success: true,
        data: result.payments,
        pagination: {
          total: result.total,
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0,
        },
      });
    } catch (error) {
      log.error('Error fetching crypto payments:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch crypto payments',
      });
    }
  }

  /**
   * GET /api/admin/crypto/payments/:id
   * Get crypto payment details (admin endpoint)
   */
  static async getPaymentById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const payment = await prisma.cryptoPayment.findUnique({
        where: { id },
        include: {
          order: {
            select: {
              orderNumber: true,
              status: true,
              finalPrice: true,
              customer: {
                select: {
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Crypto payment not found',
        });
      }

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      log.error('Error fetching crypto payment:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to fetch crypto payment',
      });
    }
  }

  /**
   * POST /api/crypto/regenerate/:orderId
   * Regenerate crypto invoice to allow changing currency/network (public endpoint)
   */
  static async regenerateInvoice(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'orderId is required',
        });
      }

      // Check if Cryptomus is configured
      if (!CryptomusService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Crypto payments are not configured',
        });
      }

      const result = await CryptomusService.regeneratePaymentForOrder(orderId);

      res.json({
        success: true,
        data: {
          paymentUrl: result.paymentUrl,
          cryptoPaymentId: result.cryptoPayment.id,
          expiresAt: result.cryptoPayment.expiresAt,
        },
      });
    } catch (error: any) {
      log.error('Error regenerating crypto invoice:', error);

      if (error.message === 'Order not found') {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Order not found',
        });
      }

      if (error.message?.includes('Cannot regenerate payment')) {
        return res.status(409).json({
          success: false,
          error: 'CONFLICT',
          message: error.message,
        });
      }

      if (error.message?.includes('not in a valid state')) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATE',
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to regenerate crypto invoice',
      });
    }
  }

  /**
   * POST /api/admin/crypto/refresh/:id
   * Refresh payment status from Cryptomus (admin endpoint)
   */
  static async refreshStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const payment = await prisma.cryptoPayment.findUnique({
        where: { id },
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Crypto payment not found',
        });
      }

      // Get status from Cryptomus
      const cryptomusStatus = await CryptomusService.getPaymentStatus(payment.cryptomusUuid);

      if (!cryptomusStatus) {
        return res.status(502).json({
          success: false,
          error: 'EXTERNAL_ERROR',
          message: 'Failed to get status from Cryptomus',
        });
      }

      // Update our record
      const newStatus = CryptomusService.mapCryptomusStatus(cryptomusStatus.status);
      const updatedPayment = await prisma.cryptoPayment.update({
        where: { id },
        data: {
          status: newStatus,
          txHash: cryptomusStatus.txid || payment.txHash,
          paidAmount: cryptomusStatus.payment_amount ? parseFloat(cryptomusStatus.payment_amount) : payment.paidAmount,
          cryptoCurrency: cryptomusStatus.payer_currency || payment.cryptoCurrency,
          network: cryptomusStatus.network || payment.network,
        },
      });

      res.json({
        success: true,
        data: updatedPayment,
        message: `Status refreshed: ${newStatus}`,
      });
    } catch (error) {
      log.error('Error refreshing crypto payment status:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to refresh crypto payment status',
      });
    }
  }
}
