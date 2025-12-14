import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config';
import { log } from '../../utils/logger';
import { prisma } from '../../database/client';
import { botManager } from '../../bots/BotManager';
import { GiftStatus, OrderStatus, FriendshipStatus } from '@prisma/client';
import { GiftRequest } from '../../types';
import { isFriendshipReady, getHoursUntilReady } from '../../utils/helpers';
import { GiftWaitPeriodError, BotNoGiftsAvailableError } from '../../utils/errors';
import { queueManager } from '../QueueManager';
import { BotAssignmentService } from '../../bots/BotAssignmentService';
import { OrderProgressTracker } from '../../services/OrderProgressTracker';

/**
 * Processor for gift queue
 * Handles sending gifts to users
 */
export class GiftProcessor {
  private worker: Worker;

  constructor() {
    const connection = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker(
      'gift',
      async (job: Job<GiftRequest>) => {
        return await this.processGift(job);
      },
      {
        connection,
        concurrency: config.queue.concurrency,
        limiter: {
          max: 5,
          duration: 60000, // 5 gifts per minute
        },
      }
    );

    this.setupWorkerEvents();

    log.info('GiftProcessor initialized', {
      concurrency: config.queue.concurrency,
    });
  }

  /**
   * Process a gift job
   */
  private async processGift(job: Job<GiftRequest>): Promise<any> {
    const { orderId, recipientEpicId, recipientName, itemId, itemName } = job.data;

    log.gift.sending(job.id!, { orderId, recipientName, itemId });

    try {
      // Get order
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Get or assign a bot using intelligent assignment service
      let botId = order.assignedBotId;

      if (!botId) {
        // Use intelligent bot assignment
        const assignment = await BotAssignmentService.assignBotToOrder(order);

        // Handle assignment result
        switch (assignment.status) {
          case 'ASSIGNED':
            // ✅ Bot assigned successfully
            botId = assignment.botId!;

            await prisma.order.update({
              where: { id: orderId },
              data: {
                assignedBotId: botId,
                assignedAt: new Date(),
                status: OrderStatus.PROCESSING,
              },
            });

            await OrderProgressTracker.update(
              orderId,
              'BOT_ASSIGNED',
              `Bot ${assignment.botName} asignado`
            );

            log.info(`✅ Bot ${assignment.botName} assigned to order ${orderId}`);
            break;

          case 'REQUEUE':
            // 🔄 Requeue for later
            log.info(`🔄 Requeuing order ${orderId}: ${assignment.reason}`);

            await OrderProgressTracker.update(
              orderId,
              'WAITING_BOT',
              assignment.reason
            );

            // Reschedule job for later
            await queueManager.scheduleJob(
              'gift',
              `gift-retry-${orderId}-${Date.now()}`,
              job.data,
              assignment.retryAfter!
            );

            return { status: 'requeued', reason: assignment.reason };

          case 'WAITING_MANUAL_ACTION':
            // ⏸️ Requires manual intervention - PAUSE order, don't retry
            const newStatus =
              assignment.action === 'LOAD_VBUCKS'
                ? OrderStatus.WAITING_VBUCKS
                : OrderStatus.WAITING_BOT_FIX;

            await prisma.order.update({
              where: { id: orderId },
              data: { status: newStatus },
            });

            await OrderProgressTracker.update(
              orderId,
              'BLOCKED',
              assignment.reason
            );

            log.warn(`⏸️ Order ${orderId} paused for manual intervention: ${assignment.reason}`);

            // Return success to prevent BullMQ from retrying
            // Order will remain in WAITING_VBUCKS or WAITING_BOT_FIX status
            // until admin manually triggers continuation via /vbucks-loaded or /bot-fixed endpoints
            return {
              status: 'paused',
              reason: assignment.reason,
              action: assignment.action
            };
        }
      }

      // Check friendship status
      const friendship = await prisma.friendship.findUnique({
        where: {
          botId_epicAccountId: {
            botId,
            epicAccountId: recipientEpicId,
          },
        },
      });

      if (!friendship) {
        // Need to establish friendship first
        await queueManager.addFriendshipJob({
          botId,
          epicAccountId: recipientEpicId,
          displayName: recipientName,
          orderId,
        });

        await prisma.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.WAITING_FRIENDSHIP },
        });

        await OrderProgressTracker.update(
          orderId,
          'FRIENDSHIP_REQUESTED',
          `Solicitud de amistad enviada a ${recipientName}`
        );

        // Reschedule gift for later (after 48h wait)
        const delay = config.bot.friendshipWaitHours * 60 * 60 * 1000;
        await queueManager.scheduleJob('gift', 'send-gift', job.data, delay);

        log.info('Friendship required, gift rescheduled', {
          orderId,
          delay: `${config.bot.friendshipWaitHours}h`,
        });

        return { status: 'rescheduled', reason: 'friendship_required' };
      }

      // Check if friendship is ready
      if (!isFriendshipReady(friendship.canGiftAt)) {
        const hoursRemaining = getHoursUntilReady(friendship.canGiftAt);

        await prisma.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.WAITING_PERIOD },
        });

        await OrderProgressTracker.update(
          orderId,
          'WAITING_PERIOD',
          `Esperando período de 48h. Quedan ${hoursRemaining.toFixed(1)} horas`
        );

        throw new GiftWaitPeriodError(hoursRemaining);
      }

      // Check bot has gifts available
      const bot = await prisma.bot.findUnique({ where: { id: botId } });

      if (!bot || bot.giftsAvailable <= 0) {
        throw new BotNoGiftsAvailableError(botId);
      }

      // Create gift record
      const gift = await prisma.gift.create({
        data: {
          botId,
          orderId,
          recipientEpicId,
          recipientName,
          itemId,
          itemName,
          status: GiftStatus.SENDING,
        },
      });

      // Get bot client
      const botClient = botManager.getBot(botId);

      await OrderProgressTracker.update(
        orderId,
        'SENDING_GIFT',
        `Enviando ${itemName} a ${recipientName}`
      );

      // Resolve recipient (convert display name to account ID if needed)
      const resolvedAccountId = await botClient.resolveGiftRecipient(recipientEpicId);

      // Resolve and validate item (ensure it's in catalog and giftable)
      const resolvedItem = await botClient.resolveOfferIdForGift(itemId);

      // Send the gift with resolved values
      await botClient.sendGift(resolvedAccountId, resolvedItem.offerId, resolvedItem.price);

      // Update gift status
      await prisma.gift.update({
        where: { id: gift.id },
        data: {
          status: GiftStatus.SENT,
          sentAt: new Date(),
        },
      });

      // Update order status
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await OrderProgressTracker.update(
        orderId,
        'GIFT_SENT',
        `Regalo enviado exitosamente a ${recipientName}`
      );

      // Note: Gift tracking is now automatic via Gift table queries
      // No need to manually decrement counters

      // Update V-Bucks balance after sending gift
      try {
        const updatedVBucks = await botClient.getVBucks();
        await prisma.bot.update({
          where: { id: botId },
          data: { vBucks: updatedVBucks },
        });
      } catch (vbucksError) {
        log.bot.warn(botId, 'Failed to update V-Bucks after gift', vbucksError);
        // Don't fail the entire gift operation if V-Bucks update fails
      }

      log.gift.sent(gift.id, {
        orderId,
        botId,
        recipientName,
        itemName,
      });

      return { status: 'sent', giftId: gift.id };
    } catch (error) {
      log.gift.failed(job.id!, error instanceof Error ? error.message : 'Unknown error', {
        orderId,
        recipientName,
      });

      // Update gift status
      const existingGift = await prisma.gift.findFirst({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });

      if (existingGift) {
        await prisma.gift.update({
          where: { id: existingGift.id },
          data: {
            status: GiftStatus.FAILED,
            failedAt: new Date(),
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            retryCount: { increment: 1 },
          },
        });
      }

      // Update order
      await prisma.order.update({
        where: { id: orderId },
        data: {
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Set up worker event listeners
   */
  private setupWorkerEvents(): void {
    this.worker.on('completed', (job) => {
      log.debug('Gift job completed', { jobId: job.id });
    });

    this.worker.on('failed', async (job, error) => {
      log.error('Gift job failed', {
        jobId: job?.id,
        error: error.message,
        attempts: job?.attemptsMade,
      });

      // If max retries reached, mark order as failed
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        const orderId = job.data.orderId;

        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.FAILED,
            failedAt: new Date(),
            failureReason: `Max retries exceeded: ${error.message}`,
          },
        });

        await OrderProgressTracker.update(
          orderId,
          'FAILED',
          `Orden fallida después de ${job.attemptsMade} intentos: ${error.message}`
        );

        // Get order number for logging
        const failedOrder = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
        log.order.error(failedOrder?.orderNumber || orderId, `Max reintentos excedidos: ${error.message}`);
      } else if (job) {
        // Retry attempt
        const orderId = job.data.orderId;
        await OrderProgressTracker.update(
          orderId,
          'RETRY',
          `Reintento ${job.attemptsMade}/${job.opts.attempts || 3}: ${error.message}`
        );
      }
    });

    this.worker.on('error', (error) => {
      log.error('Gift worker error', error);
    });
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    log.info('GiftProcessor closed');
  }
}
