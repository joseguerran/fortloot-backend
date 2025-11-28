import { Request, Response } from 'express';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { OrderStatus } from '@prisma/client';
import { EmailService } from '../../services/EmailService';
import { WhatsAppService } from '../../services/WhatsAppService';

export class PaymentController {
  /**
   * Upload payment proof (customer)
   */
  static async uploadProof(req: Request, res: Response) {
    const { orderId } = req.params;
    const { paymentMethod, transactionId, notes } = req.body;

    // Validate order exists and belongs to customer
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Check order status - allow PENDING_PAYMENT or PAYMENT_UPLOADED (in case they want to re-upload)
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'PAYMENT_UPLOADED') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_STATUS',
        message: `Cannot upload payment proof for order in status: ${order.status}`,
      });
    }

    // Check if order has expired
    const now = new Date();
    if (order.expiresAt && order.expiresAt < now) {
      return res.status(400).json({
        success: false,
        error: 'ORDER_EXPIRED',
        message: 'Esta orden ha expirado. Por favor, realiza una nueva compra desde el inicio para garantizar la disponibilidad de los items.',
        data: {
          expiredAt: order.expiresAt,
          orderNumber: order.orderNumber,
        },
      });
    }

    // Calculate time until expiration
    const timeUntilExpiration = order.expiresAt ? order.expiresAt.getTime() - now.getTime() : Infinity;
    const hoursUntilExpiration = timeUntilExpiration / (1000 * 60 * 60);

    // Warning if less than 1 hour until expiration (shop rotation)
    let warningMessage = null;
    if (order.expiresAt && hoursUntilExpiration < 1) {
      warningMessage = `⚠️ ADVERTENCIA: Quedan menos de ${Math.floor(hoursUntilExpiration * 60)} minutos antes del cambio de tienda. Existe riesgo de que el item ya no esté disponible. Si no podemos completar tu pedido, te enviaremos un cupón de descuento del mismo valor para compras futuras.`;
    }

    // Handle file upload (if present)
    let paymentProofUrl = order.paymentProofUrl;
    if (req.file) {
      // Save file to uploads directory
      const uploadsDir = path.join(process.cwd(), 'uploads', 'payment-proofs');
      await fs.mkdir(uploadsDir, { recursive: true });

      const fileName = `${orderId}-${Date.now()}-${req.file.originalname}`;
      const filePath = path.join(uploadsDir, fileName);

      await fs.writeFile(filePath, req.file.buffer);
      paymentProofUrl = `/uploads/payment-proofs/${fileName}`;

      log.info(`Payment proof uploaded: ${fileName}`);
    }

    // Update order
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAYMENT_UPLOADED',
        paymentMethod,
        transactionId,
        paymentProofUrl,
        paymentNotes: notes,
        paymentUploadedAt: new Date(),
        currentStep: 'Comprobante subido. Esperando verificación del pago.',
      },
    });

    // Track progress
    const { OrderProgressTracker } = await import('../../services/OrderProgressTracker');
    await OrderProgressTracker.update(orderId, 'PAYMENT_UPLOADED', 'Comprobante de pago subido');

    log.info(`Payment proof uploaded for order ${order.orderNumber}`);

    // Send email notification to admin
    await EmailService.sendPaymentUploadedNotification(
      updated.orderNumber,
      updated.finalPrice || 0,
      order.customer.epicAccountId
    );

    // Notify admin via WhatsApp
    await WhatsAppService.notifyPaymentUploaded(
      updated.orderNumber,
      order.customer.epicAccountId,
      updated.finalPrice || 0
    );

    res.json({
      success: true,
      message: warningMessage || 'Comprobante de pago subido exitosamente. Esperando verificación.',
      warning: warningMessage ? true : false,
      data: {
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        paymentProofUrl: updated.paymentProofUrl,
        expiresAt: order.expiresAt,
        hoursUntilExpiration: hoursUntilExpiration < 24 ? Math.round(hoursUntilExpiration * 10) / 10 : null,
      },
    });
  }

  /**
   * Get pending payment verifications (admin)
   */
  static async getPendingVerifications(req: Request, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: {
          status: 'PAYMENT_UPLOADED',
        },
        include: {
          customer: {
            select: {
              id: true,
              displayName: true,
              epicAccountId: true,
              email: true,
              phoneNumber: true,
              tier: true,
              isBlacklisted: true,
            },
          },
        },
        orderBy: {
          paymentUploadedAt: 'asc', // Oldest first
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({
        where: { status: 'PAYMENT_UPLOADED' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  }

  /**
   * Verify payment (admin)
   */
  static async verifyPayment(req: Request, res: Response) {
    const { orderId } = req.params;
    const { approved, rejectionReason } = req.body;
    const userId = (req as any).user?.id || 'system';

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    if (order.status !== 'PAYMENT_UPLOADED') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_STATUS',
        message: `Cannot verify payment for order in status: ${order.status}`,
      });
    }

    if (approved) {
      // Approve payment
      const updated = await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAYMENT_VERIFIED',
          paymentVerifiedAt: new Date(),
          paymentVerifiedBy: userId,
        },
      });

      // Update customer stats
      await prisma.customer.update({
        where: { id: order.customerId! },
        data: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: order.finalPrice || 0 },
          lifetimeValue: { increment: order.profitAmount || 0 },
        },
      });

      log.info(
        `Payment verified for order ${order.orderNumber} by user ${userId}`
      );

      // Send email notification to customer
      await EmailService.sendPaymentVerifiedNotification(
        order.customer!.email,
        order.orderNumber,
        order.finalPrice || 0
      );

      res.json({
        success: true,
        data: updated,
        message: 'Payment verified successfully',
      });
    } else {
      // Reject payment
      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'rejectionReason is required when rejecting payment',
        });
      }

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAYMENT_REJECTED',
          paymentVerifiedAt: new Date(),
          paymentVerifiedBy: userId,
          paymentNotes: rejectionReason,
        },
      });

      log.info(
        `Payment rejected for order ${order.orderNumber} by user ${userId}: ${rejectionReason}`
      );

      // Send email notification to customer with rejection reason
      await EmailService.sendPaymentRejectedNotification(
        order.customer!.email,
        order.orderNumber,
        rejectionReason
      );

      res.json({
        success: true,
        data: updated,
        message: 'Payment rejected',
      });
    }
  }

  /**
   * Get payment history for order (admin)
   */
  static async getPaymentHistory(req: Request, res: Response) {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            epicAccountId: true,
            email: true,
            tier: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Get audit logs for this order
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resource: 'Order',
        resourceId: orderId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });

    res.json({
      success: true,
      data: {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          finalPrice: order.finalPrice,
          paymentMethod: order.paymentMethod,
          transactionId: order.transactionId,
          paymentProofUrl: order.paymentProofUrl,
          paymentNotes: order.paymentNotes,
          paymentUploadedAt: order.paymentUploadedAt,
          paymentVerifiedAt: order.paymentVerifiedAt,
          paymentVerifiedBy: order.paymentVerifiedBy,
          customer: order.customer,
        },
        auditLogs,
      },
    });
  }

  /**
   * Get payment statistics (admin)
   */
  static async getPaymentStats(req: Request, res: Response) {
    const { startDate, endDate } = req.query;

    const where: any = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [
      pendingPayment,
      paymentUploaded,
      paymentVerified,
      paymentRejected,
      totalRevenue,
    ] = await Promise.all([
      prisma.order.count({
        where: { ...where, status: 'PENDING_PAYMENT' },
      }),
      prisma.order.count({
        where: { ...where, status: 'PAYMENT_UPLOADED' },
      }),
      prisma.order.count({
        where: { ...where, status: 'PAYMENT_VERIFIED' },
      }),
      prisma.order.count({
        where: { ...where, status: 'PAYMENT_REJECTED' },
      }),
      prisma.order.aggregate({
        where: {
          ...where,
          status: { in: ['PAYMENT_VERIFIED', 'COMPLETED'] },
        },
        _sum: {
          finalPrice: true,
          profitAmount: true,
        },
      }),
    ]);

    // Average verification time
    const verifiedOrders = await prisma.order.findMany({
      where: {
        ...where,
        status: { in: ['PAYMENT_VERIFIED', 'COMPLETED'] },
        paymentUploadedAt: { not: null },
        paymentVerifiedAt: { not: null },
      },
      select: {
        paymentUploadedAt: true,
        paymentVerifiedAt: true,
      },
    });

    let averageVerificationTime = 0;
    if (verifiedOrders.length > 0) {
      const totalTime = verifiedOrders.reduce((sum, order) => {
        const uploadTime = order.paymentUploadedAt!.getTime();
        const verifyTime = order.paymentVerifiedAt!.getTime();
        return sum + (verifyTime - uploadTime);
      }, 0);
      averageVerificationTime = Math.round(totalTime / verifiedOrders.length / 1000 / 60); // minutes
    }

    res.json({
      success: true,
      data: {
        pendingPayment,
        paymentUploaded,
        paymentVerified,
        paymentRejected,
        totalRevenue: totalRevenue._sum.finalPrice || 0,
        totalProfit: totalRevenue._sum.profitAmount || 0,
        averageVerificationTimeMinutes: averageVerificationTime,
      },
    });
  }

  /**
   * Retry payment upload (customer)
   */
  static async retryPayment(req: Request, res: Response) {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    if (order.status !== 'PAYMENT_REJECTED') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_STATUS',
        message: 'Can only retry payment for rejected orders',
      });
    }

    // Check if order has expired
    if (order.expiresAt && order.expiresAt < new Date()) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });

      return res.status(400).json({
        success: false,
        error: 'ORDER_EXPIRED',
        message: 'Order has expired',
      });
    }

    // Reset to PENDING_PAYMENT
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PENDING_PAYMENT',
        paymentVerifiedAt: null,
        paymentVerifiedBy: null,
      },
    });

    log.info(`Payment retry initiated for order ${order.orderNumber}`);

    res.json({
      success: true,
      data: updated,
      message: 'Order reset to pending payment. You can upload proof again.',
    });
  }
}
