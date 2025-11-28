import { Request, Response } from 'express';
import { prisma } from '../../database/client';
import { queueManager } from '../../queue/QueueManager';
import { botManager } from '../../bots/BotManager';
import { log } from '../../utils/logger';
import { OrderCreateRequest, OrderStatusResponse } from '../../types';
import { OrderNotFoundError } from '../../utils/errors';
import { calculateEstimatedDelivery, getPriorityValue } from '../../utils/helpers';
import { OrderStatus, FriendshipStatus, ProductType } from '@prisma/client';
import { PricingService } from '../../services/PricingService';
import { EmailService } from '../../services/EmailService';
import { WhatsAppService } from '../../services/WhatsAppService';
import { config } from '../../config';

// Helper function to normalize product type from frontend to backend enum
function normalizeProductType(type: string): ProductType {
  const typeMap: Record<string, ProductType> = {
    'vbucks': ProductType.VBUCKS,
    'crew': ProductType.BATTLE_PASS, // Crew uses BATTLE_PASS type
    'battle_pass': ProductType.BATTLE_PASS,
    'bundle': ProductType.BUNDLE,
    'outfit': ProductType.SKIN,
    'skin': ProductType.SKIN,
    'emote': ProductType.EMOTE,
    'pickaxe': ProductType.PICKAXE,
    'glider': ProductType.GLIDER,
    'backpack': ProductType.BACKPACK,
    'wrap': ProductType.WRAP,
  };

  return typeMap[type?.toLowerCase()] || ProductType.OTHER;
}

export class OrderController {
  /**
   * Create a new order
   */
  static async createOrder(req: Request, res: Response) {
    const {
      customerId,
      items,
      totalAmount,
      subtotalAmount,
      discountAmount,
      profitAmount,
      checkoutStartedAt,
      hasManualItems
    } = req.body;

    // Get customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      });
    }

    // Check blacklist
    if (customer.isBlacklisted) {
      return res.status(403).json({
        success: false,
        error: 'CUSTOMER_BLACKLISTED',
        message: 'Customer is blacklisted',
      });
    }

    // Option A: Check for existing PENDING_PAYMENT order for this customer
    // If found, reuse it instead of creating a new one
    const existingOrder = await prisma.order.findFirst({
      where: {
        customerId: customer.id,
        status: OrderStatus.PENDING_PAYMENT,
      },
      orderBy: {
        createdAt: 'desc', // Get the most recent one
      },
    });

    if (existingOrder) {
      // Reuse existing order - update expiration time with new timeout
      const now = new Date();
      const paymentUploadTimeout = config.order.paymentUploadTimeoutMinutes;
      const newExpiresAt = new Date(now.getTime() + paymentUploadTimeout * 60 * 1000);

      // Delete old order items and create new ones
      await prisma.orderItem.deleteMany({
        where: { orderId: existingOrder.id },
      });

      const updatedOrder = await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          // Update pricing with new values
          basePrice: subtotalAmount,
          profitAmount: profitAmount,
          discountAmount: discountAmount,
          finalPrice: totalAmount,
          // Reset expiration time
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
          // Create new OrderItems
          orderItems: {
            create: items.map((item: any) => ({
              catalogItemId: item.catalogItemId,
              productName: item.name || 'Product',
              productType: normalizeProductType(item.type),
              itemId: item.catalogItemId,
              quantity: item.quantity,
              basePrice: item.priceAtPurchase || 0,
              profitAmount: 0,
              discountAmount: 0,
              finalPrice: item.priceAtPurchase || 0,
            })),
          },
        },
      });

      log.info(`Reusing existing order ${existingOrder.orderNumber} for customer ${customer.displayName}`);

      return res.status(200).json({
        success: true,
        data: {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: updatedOrder.status,
          totalAmount: updatedOrder.finalPrice,
          expiresAt: updatedOrder.expiresAt,
        },
        message: 'Existing order updated successfully. Please upload payment proof.',
      });
    }

    // No existing order found - create new one
    // Calculate expiration: configurable timeout for payment upload (e.g., 10 minutes)
    const now = new Date();
    const paymentUploadTimeout = config.order.paymentUploadTimeoutMinutes;
    const expiresAt = new Date(now.getTime() + paymentUploadTimeout * 60 * 1000);

    // Generate order number
    const orderNumber = `FL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Create order in database with OrderItems for multi-item support
    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        status: OrderStatus.PENDING_PAYMENT,

        // Pricing (totals calculated from OrderItems)
        basePrice: subtotalAmount,
        profitAmount: profitAmount,
        discountAmount: discountAmount,
        finalPrice: totalAmount,
        currency: 'USD',

        expiresAt,
        priority: 'NORMAL',

        // Checkout tracking
        checkoutStartedAt: checkoutStartedAt ? new Date(checkoutStartedAt) : new Date(),
        hasManualItems: hasManualItems || false,

        // Create OrderItems for each item in cart
        orderItems: {
          create: items.map((item: any) => ({
            catalogItemId: item.catalogItemId,
            productName: item.name || 'Product',
            productType: normalizeProductType(item.type),
            itemId: item.catalogItemId,
            quantity: item.quantity,
            basePrice: item.priceAtPurchase || 0,
            profitAmount: 0,
            discountAmount: 0,
            finalPrice: item.priceAtPurchase || 0,
          })),
        },
      },
    });

    log.order.created(order.id, { customerId, totalAmount });

    // Add progress tracking for order creation
    const { OrderProgressTracker } = await import('../../services/OrderProgressTracker');
    await OrderProgressTracker.update(
      order.id,
      'CREATED',
      `Orden ${order.orderNumber} creada exitosamente`
    );
    await OrderProgressTracker.update(
      order.id,
      'PAYMENT_PENDING',
      `Esperando comprobante de pago. Válido hasta ${expiresAt.toLocaleString('es-ES')}`
    );

    // Send payment instructions email
    await EmailService.sendPaymentInstructions(
      customer.email,
      order.orderNumber,
      totalAmount,
      expiresAt
    );

    // Notify admin via WhatsApp
    await WhatsAppService.notifyOrderCreated(
      order.orderNumber,
      customer.displayName,
      totalAmount,
      items.length
    );

    // Order starts in PENDING_PAYMENT status
    // Will advance after payment verification

    res.status(201).json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmount: order.finalPrice,
        expiresAt: order.expiresAt,
      },
      message: 'Order created successfully. Please upload payment proof.',
    });
  }

  /**
   * Get order by order number (public endpoint for email links)
   */
  static async getOrderByNumber(req: Request, res: Response) {
    const { orderNumber } = req.params;

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        priority: true,
        currency: true,
        basePrice: true,
        discountAmount: true,
        finalPrice: true,
        paymentMethod: true,
        paymentProofUrl: true,
        paymentUploadedAt: true,
        paymentRejectedReason: true,
        transactionId: true,
        estimatedDelivery: true,
        completedAt: true,
        failedAt: true,
        failureReason: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: {
            id: true,
            displayName: true,
            epicAccountId: true,
            tier: true,
          },
        },
        orderItems: {
          include: {
            catalogItem: {
              select: {
                name: true,
                description: true,
                type: true,
                image: true,
                rarity: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: `Order ${orderNumber} not found`,
      });
    }

    res.json({
      success: true,
      data: order,
    });
  }

  /**
   * Get order status
   */
  static async getOrderStatus(req: Request, res: Response) {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        priority: true,
        currency: true,
        basePrice: true,
        discountAmount: true,
        finalPrice: true,
        profitAmount: true,
        paymentMethod: true,
        paymentProofUrl: true,
        paymentUploadedAt: true,
        paymentVerifiedAt: true,
        paymentVerifiedBy: true,
        paymentRejectedReason: true,
        paymentNotes: true,
        transactionId: true,
        assignedBotId: true,
        assignedAt: true,
        attempts: true,
        maxAttempts: true,
        lastAttemptAt: true,
        estimatedDelivery: true,
        completedAt: true,
        failedAt: true,
        failureReason: true,
        expiresAt: true,
        checkoutStartedAt: true,
        hasManualItems: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        currentStep: true,
        progressSteps: true,
        reassignmentCount: true,
        customer: {
          select: {
            id: true,
            displayName: true,
            epicAccountId: true,
            email: true,
            phoneNumber: true,
            tier: true,
          },
        },
        orderItems: {
          include: {
            catalogItem: {
              select: {
                name: true,
                description: true,
                type: true,
                image: true,
              },
            },
          },
        },
        gifts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    // Build progress steps
    const steps: string[] = [];
    let current = '';

    switch (order.status) {
      case OrderStatus.PENDING:
      case OrderStatus.PENDING_PAYMENT:
        current = 'Waiting for payment';
        steps.push('Order created', 'Payment pending', 'Verification', 'Delivery');
        break;
      case OrderStatus.PAYMENT_UPLOADED:
        current = 'Payment uploaded, awaiting verification';
        steps.push('✓ Order created', '✓ Payment uploaded', 'Verification', 'Delivery');
        break;
      case OrderStatus.PAYMENT_VERIFIED:
        current = 'Payment verified';
        steps.push('✓ Order created', '✓ Payment uploaded', '✓ Verified', 'Preparing delivery');
        break;
      case OrderStatus.PAYMENT_REJECTED:
        current = 'Payment rejected - please re-upload';
        steps.push('✓ Order created', '✗ Payment rejected', 'Retry required');
        break;
      case OrderStatus.WAITING_FRIENDSHIP:
        current = 'Waiting for friend request acceptance';
        steps.push('✓ Payment verified', 'Friend request sent', 'Waiting acceptance', 'Delivery');
        break;
      case OrderStatus.WAITING_PERIOD:
        current = 'Waiting for 48-hour period';
        steps.push('✓ Payment verified', '✓ Friends connected', 'Waiting 48h', 'Delivery');
        break;
      case OrderStatus.QUEUED:
        current = 'In queue for delivery';
        steps.push('✓ Payment verified', '✓ Ready', 'In queue', 'Processing');
        break;
      case OrderStatus.PROCESSING:
        current = 'Sending gift now';
        steps.push('✓ Payment verified', '✓ Ready', '✓ Processing', 'Sending...');
        break;
      case OrderStatus.COMPLETED:
        current = 'Gift delivered successfully';
        steps.push('✓ Payment', '✓ Ready', '✓ Sent', '✓ Completed');
        break;
      case OrderStatus.FAILED:
        current = 'Order failed';
        steps.push('Payment verified', 'Processing', '✗ Failed');
        break;
      case OrderStatus.EXPIRED:
        current = 'Order expired';
        steps.push('Order created', '✗ Expired');
        break;
      case OrderStatus.CANCELLED:
        current = 'Order cancelled';
        steps.push('Order created', '✗ Cancelled');
        break;
    }

    res.json({
      success: true,
      data: {
        ...order,
        progress: {
          current,
          steps,
        },
      },
    });
  }

  /**
   * Get all orders (with pagination)
   */
  static async getOrders(req: Request, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;

    const where = status ? { status: status as any } : {};

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          customer: {
            select: {
              id: true,
              displayName: true,
              epicAccountId: true,
              email: true,
              phoneNumber: true,
              tier: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
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
   * Approve/verify order payment
   */
  static async approveOrder(req: Request, res: Response) {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
      },
    });

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    // Validate current status
    if (order.status !== OrderStatus.PAYMENT_UPLOADED) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_STATUS',
        message: `Cannot approve order with status ${order.status}. Order must be in PAYMENT_UPLOADED status.`,
      });
    }

    // Update order status to PAYMENT_VERIFIED
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.PAYMENT_VERIFIED,
        paymentVerifiedAt: new Date(),
      },
    });

    // Track progress
    const { OrderProgressTracker } = await import('../../services/OrderProgressTracker');
    await OrderProgressTracker.update(orderId, 'PAYMENT_VERIFIED', 'Pago verificado por administrador');

    log.order.updated(orderId, 'PAYMENT_VERIFIED');

    // Send confirmation email
    if (order.customer?.email) {
      await EmailService.sendPaymentVerifiedNotification(
        order.customer.email,
        order.orderNumber,
        order.finalPrice
      );
    }

    // Queue the order for processing
    await queueManager.addOrderToQueue(orderId);

    res.json({
      success: true,
      data: updatedOrder,
      message: 'Order payment approved successfully',
    });
  }

  /**
   * Cancel an order
   */
  static async cancelOrder(req: Request, res: Response) {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    if (order.status === OrderStatus.COMPLETED) {
      return res.status(400).json({
        success: false,
        error: 'ORDER_ALREADY_COMPLETED',
        message: 'Cannot cancel completed order',
      });
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });

    // Add progress tracking for cancellation
    const { OrderProgressTracker } = await import('../../services/OrderProgressTracker');
    await OrderProgressTracker.update(
      orderId,
      'CANCELLED',
      'Orden cancelada por administrador'
    );

    log.order.updated(orderId, 'CANCELLED');

    res.json({
      success: true,
      message: 'Order cancelled successfully',
    });
  }

  /**
   * Retry a failed order
   */
  static async retryOrder(req: Request, res: Response) {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        orderItems: {
          include: { catalogItem: true },
        },
      },
    });

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    if (order.status === OrderStatus.COMPLETED) {
      return res.status(400).json({
        success: false,
        error: 'ORDER_ALREADY_COMPLETED',
        message: 'Cannot retry completed order',
      });
    }

    // Update order status back to QUEUED
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.QUEUED,
        assignedBotId: null, // Clear bot assignment for reassignment
        failureReason: null, // Clear error message
        failedAt: null, // Clear failed timestamp
      },
    });

    // Track progress
    const { OrderProgressTracker } = await import('../../services/OrderProgressTracker');
    await OrderProgressTracker.update(orderId, 'RETRY_REQUESTED', 'Reintento manual solicitado por administrador');

    log.order.updated(orderId, 'QUEUED');

    // Re-queue the order for processing
    await queueManager.addOrderToQueue(orderId);

    res.json({
      success: true,
      data: updatedOrder,
      message: 'Order queued for retry',
    });
  }

  /**
   * Mark V-Bucks as loaded (Manual Intervention)
   * Admin endpoint to resume order after loading V-Bucks
   */
  static async markVBucksLoaded(req: Request, res: Response) {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    if (order.status !== OrderStatus.WAITING_VBUCKS) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_STATUS',
        message: `Cannot mark V-Bucks loaded for order with status ${order.status}. Order must be in WAITING_VBUCKS status.`,
      });
    }

    // Update order status back to QUEUED
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.QUEUED,
        assignedBotId: null, // Clear bot assignment to allow reassignment
        failureReason: null, // Clear error message
        failedAt: null, // Clear failed timestamp
      },
    });

    // Track progress
    const { OrderProgressTracker } = await import('../../services/OrderProgressTracker');
    await OrderProgressTracker.update(orderId, 'VBUCKS_LOADED', 'V-Bucks cargados manualmente, reencolando orden');

    log.info(`✅ V-Bucks loaded for order ${orderId}, moving back to QUEUED`);

    // Re-queue the order for processing (bot assignment will happen again)
    await queueManager.addOrderToQueue(orderId);

    res.json({
      success: true,
      data: updatedOrder,
      message: 'V-Bucks marked as loaded. Order queued for retry.',
    });
  }

  /**
   * Mark bot as fixed (Manual Intervention)
   * Admin endpoint to resume order after fixing bot credentials
   */
  static async markBotFixed(req: Request, res: Response) {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    if (order.status !== OrderStatus.WAITING_BOT_FIX) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_STATUS',
        message: `Cannot mark bot fixed for order with status ${order.status}. Order must be in WAITING_BOT_FIX status.`,
      });
    }

    // Update order status back to QUEUED
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.QUEUED,
        assignedBotId: null, // Clear bot assignment to allow reassignment
        failureReason: null, // Clear error message
        failedAt: null, // Clear failed timestamp
      },
    });

    // Track progress
    const { OrderProgressTracker } = await import('../../services/OrderProgressTracker');
    await OrderProgressTracker.update(orderId, 'BOT_FIXED', 'Bot reparado manualmente, reencolando orden');

    log.info(`✅ Bot fixed for order ${orderId}, moving back to QUEUED`);

    // Re-queue the order for processing (bot assignment will happen again)
    await queueManager.addOrderToQueue(orderId);

    res.json({
      success: true,
      data: updatedOrder,
      message: 'Bot marked as fixed. Order queued for retry.',
    });
  }
}
