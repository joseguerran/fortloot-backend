import { Request, Response } from 'express';
import { OTPService } from '../../services/OTPService';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import { ContactType } from '@prisma/client';
import crypto from 'crypto';

export class OTPController {
  /**
   * POST /api/otp/request
   * Solicita un código OTP
   */
  static async requestOTP(req: Request, res: Response) {
    try {
      const { identifier, type } = req.body as {
        identifier: string;
        type: ContactType;
      };

      const result = await OTPService.requestOTP(identifier, type);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'OTP_REQUEST_FAILED',
          message: result.message,
        });
      }

      return res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      log.error('Error in OTP request:', error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
      });
    }
  }

  /**
   * POST /api/otp/verify
   * Verifica un código OTP y retorna los datos del cliente
   */
  static async verifyOTP(req: Request, res: Response) {
    try {
      const { identifier, type, code } = req.body as {
        identifier: string;
        type: ContactType;
        code: string;
      };

      const result = await OTPService.verifyOTP(identifier, type, code);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'OTP_VERIFICATION_FAILED',
          message: result.message,
        });
      }

      // Obtener datos completos del cliente con sus órdenes
      const customer = await prisma.customer.findUnique({
        where: { id: result.customerId },
        select: {
          id: true,
          epicAccountId: true,
          displayName: true,
          email: true,
          phoneNumber: true,
          contactPreference: true,
          tier: true,
          totalOrders: true,
          totalSpent: true,
          createdAt: true,
        },
      });

      return res.json({
        success: true,
        message: result.message,
        customer,
      });
    } catch (error) {
      log.error('Error in OTP verification:', error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
      });
    }
  }

  /**
   * POST /api/otp/request-by-epic
   * Solicita un código OTP usando el nombre de usuario de Fortnite
   */
  static async requestOTPByEpicId(req: Request, res: Response) {
    try {
      const { displayName } = req.body as {
        displayName: string;
      };

      if (!displayName) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_DISPLAY_NAME',
          message: 'Nombre de usuario es requerido',
        });
      }

      const result = await OTPService.requestOTPByEpicId(displayName);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'OTP_REQUEST_FAILED',
          message: result.message,
        });
      }

      return res.json({
        success: true,
        message: result.message,
        contactMethod: result.contactMethod,
        maskedContact: result.maskedContact,
      });
    } catch (error) {
      log.error('Error in OTP request by Epic ID:', error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
      });
    }
  }

  /**
   * POST /api/otp/verify-by-epic
   * Verifica un código OTP usando el nombre de usuario de Fortnite
   */
  static async verifyOTPByEpicId(req: Request, res: Response) {
    try {
      const { displayName, code } = req.body as {
        displayName: string;
        code: string;
      };

      if (!displayName) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_DISPLAY_NAME',
          message: 'Nombre de usuario es requerido',
        });
      }

      if (!code || code.length !== 6) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_CODE',
          message: 'El código debe ser de 6 dígitos',
        });
      }

      const result = await OTPService.verifyOTPByEpicId(displayName, code);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: 'OTP_VERIFICATION_FAILED',
          message: result.message,
        });
      }

      // Obtener datos completos del cliente
      let customer = await prisma.customer.findUnique({
        where: { id: result.customerId },
        select: {
          id: true,
          epicAccountId: true,
          displayName: true,
          email: true,
          phoneNumber: true,
          contactPreference: true,
          tier: true,
          totalOrders: true,
          totalSpent: true,
          createdAt: true,
          sessionToken: true,
        },
      });

      // Generate sessionToken if customer doesn't have one
      let sessionToken = customer?.sessionToken;
      if (!sessionToken && customer) {
        sessionToken = crypto.randomBytes(32).toString('hex');
        await prisma.customer.update({
          where: { id: customer.id },
          data: { sessionToken },
        });
      }

      // Return customer data without exposing internal sessionToken field in customer object
      const { sessionToken: _, ...customerData } = customer || {};

      return res.json({
        success: true,
        message: result.message,
        customer: customerData,
        sessionToken,
      });
    } catch (error) {
      log.error('Error in OTP verification by Epic ID:', error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
      });
    }
  }

  /**
   * GET /api/otp/orders/:customerId
   * Obtiene las órdenes de un cliente (requiere verificación OTP previa)
   */
  static async getCustomerOrders(req: Request, res: Response) {
    try {
      const { customerId } = req.params;

      // Verificar que el cliente existe
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'CUSTOMER_NOT_FOUND',
          message: 'Cliente no encontrado',
        });
      }

      // Obtener órdenes del cliente con items
      const orders = await prisma.order.findMany({
        where: { customerId },
        include: {
          orderItems: {
            include: {
              catalogItem: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                  type: true,
                  rarity: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({
        success: true,
        orders: orders.map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalAmount: order.finalPrice,
          createdAt: order.createdAt,
          completedAt: order.completedAt,
          items: order.orderItems.map(item => ({
            id: item.id,
            quantity: item.quantity,
            priceAtPurchase: item.finalPrice,
            catalogItem: item.catalogItem,
          })),
        })),
      });
    } catch (error) {
      log.error('Error fetching customer orders:', error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
      });
    }
  }
}
