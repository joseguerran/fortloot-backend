import { Router, Request, Response } from 'express';
import { CryptomusService } from '../../services/CryptomusService';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import { OrderStatus } from '@prisma/client';

const router = Router();

/**
 * POST /api/webhooks/cryptomus
 * Webhook endpoint for Cryptomus payment notifications
 *
 * This endpoint is called by Cryptomus when a payment status changes.
 * It verifies the signature and processes the payment accordingly.
 */
router.post('/cryptomus', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    log.info('Cryptomus webhook received', {
      uuid: payload.uuid,
      status: payload.status,
      order_id: payload.order_id,
    });

    // Verify webhook signature
    if (!CryptomusService.verifyWebhookSignature(payload)) {
      log.warn('Invalid Cryptomus webhook signature', { uuid: payload.uuid });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the webhook
    const result = await CryptomusService.processWebhook(payload);

    if (!result.success) {
      log.warn('Cryptomus webhook processing failed', {
        uuid: payload.uuid,
        message: result.message
      });
      return res.status(404).json({ error: result.message });
    }

    // If payment was successful, process the order automatically
    if (result.shouldProcessOrder) {
      await processOrderAfterCryptoPayment(payload.order_id);
    }

    res.json({ success: true, message: result.message });
  } catch (error: any) {
    log.error('Error processing Cryptomus webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Process an order after crypto payment is confirmed
 * This function handles the auto-processing flow for crypto payments
 */
async function processOrderAfterCryptoPayment(orderId: string): Promise<void> {
  try {
    // Get the order with customer info
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        orderItems: true,
      },
    });

    if (!order) {
      log.warn(`Order not found for crypto payment processing: ${orderId}`);
      return;
    }

    // Check if order is already processed
    if (order.status !== OrderStatus.PENDING_PAYMENT &&
        order.status !== OrderStatus.PENDING) {
      log.info(`Order ${order.orderNumber} already in status ${order.status}, skipping auto-process`);
      return;
    }

    // Update order to PAYMENT_VERIFIED
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.PAYMENT_VERIFIED,
        paymentMethod: 'CRYPTO',
        paymentVerifiedAt: new Date(),
        currentStep: 'Pago crypto confirmado. Procesando orden...',
      },
    });

    // Update customer stats
    await prisma.customer.update({
      where: { id: order.customerId },
      data: {
        totalOrders: { increment: 1 },
        totalSpent: { increment: order.finalPrice },
        lifetimeValue: { increment: order.profitAmount },
      },
    });

    // Track progress
    const { OrderProgressTracker } = await import('../../services/OrderProgressTracker');
    await OrderProgressTracker.update(orderId, 'PAYMENT_VERIFIED', 'Pago crypto confirmado automáticamente');

    log.info(`Order ${order.orderNumber} auto-processed after crypto payment`, {
      orderId,
      customerId: order.customerId,
      amount: order.finalPrice,
    });

    // Note: The order processing (friendship check, gift sending) will be handled
    // by the existing scheduled jobs that pick up PAYMENT_VERIFIED orders.
    // If you need immediate processing, you can add queue job here:
    //
    // Example (if queue manager is available):
    // const queueManager = getQueueManager();
    // await queueManager.friendshipQueue.add('checkFriendship', { orderId });

  } catch (error: any) {
    log.error(`Error auto-processing order ${orderId} after crypto payment:`, error);
    // Don't throw - webhook should still return 200 to Cryptomus
  }
}

export { router as webhookRoutes };
