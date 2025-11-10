import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config';
import { log } from '../../utils/logger';
import { prisma } from '../../database/client';
import { botManager } from '../../bots/BotManager';
import { FriendshipStatus } from '@prisma/client';
import { isFriendshipReady } from '../../utils/helpers';

/**
 * Processor for verification queue
 * Verifies friendship status and order progress
 */
export class VerificationProcessor {
  private worker: Worker;

  constructor() {
    const connection = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker(
      'verification',
      async (job: Job) => {
        if (job.name === 'verify-friendship') {
          return await this.verifyFriendship(job);
        } else if (job.name === 'verify-order') {
          return await this.verifyOrder(job);
        }
      },
      {
        connection,
        concurrency: 5,
      }
    );

    this.setupWorkerEvents();

    log.info('VerificationProcessor initialized');
  }

  /**
   * Verify friendship status
   */
  private async verifyFriendship(
    job: Job<{ id: string; botId: string; epicAccountId: string }>
  ): Promise<any> {
    const { id, botId, epicAccountId } = job.data;

    log.debug('Verifying friendship', { friendshipId: id });

    try {
      const friendship = await prisma.friendship.findUnique({
        where: { id },
      });

      if (!friendship) {
        log.warn('Friendship not found for verification', { id });
        return { status: 'not_found' };
      }

      // If already verified, skip
      if (
        friendship.status === FriendshipStatus.READY ||
        friendship.status === FriendshipStatus.REJECTED
      ) {
        return { status: 'already_verified', friendshipStatus: friendship.status };
      }

      // Get bot client and check friends list
      const botClient = botManager.getBot(botId);
      const friends = await botClient.getFriends();
      const isFriend = friends.some((f) => f.accountId === epicAccountId);

      if (isFriend) {
        // Friend request accepted
        let newStatus: FriendshipStatus;

        // Check if wait period is over
        if (isFriendshipReady(friendship.canGiftAt)) {
          newStatus = FriendshipStatus.READY;
          log.friendship.ready(botId, epicAccountId);
        } else {
          newStatus = FriendshipStatus.WAIT_PERIOD;
        }

        await prisma.friendship.update({
          where: { id },
          data: { status: newStatus },
        });

        log.friendship.accepted(botId, epicAccountId, { newStatus });

        return { status: 'accepted', friendshipStatus: newStatus };
      } else {
        // Still pending or rejected
        // Retry verification later if not too old
        const hoursSinceRequest =
          (Date.now() - friendship.friendedAt.getTime()) / 1000 / 60 / 60;

        if (hoursSinceRequest < 24) {
          // Retry in 5 minutes
          throw new Error('Friend request still pending, will retry');
        } else {
          // Mark as rejected after 24 hours
          await prisma.friendship.update({
            where: { id },
            data: { status: FriendshipStatus.REJECTED },
          });

          log.warn('Friend request expired/rejected', { friendshipId: id });

          return { status: 'rejected' };
        }
      }
    } catch (error) {
      log.error('Failed to verify friendship', { friendshipId: id, error });
      throw error;
    }
  }

  /**
   * Verify order progress and update estimated delivery
   */
  private async verifyOrder(job: Job<{ id: string }>): Promise<any> {
    const { id } = job.data;

    log.debug('Verifying order', { orderId: id });

    try {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          gifts: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!order) {
        log.warn('Order not found for verification', { id });
        return { status: 'not_found' };
      }

      // Check if order needs attention
      const hoursSinceCreation = (Date.now() - order.createdAt.getTime()) / 1000 / 60 / 60;

      // If pending for more than 72 hours, flag for review
      if (
        hoursSinceCreation > 72 &&
        (order.status === 'PENDING' || order.status === 'WAITING_FRIENDSHIP')
      ) {
        log.warn('Order pending for too long', {
          orderId: id,
          hours: hoursSinceCreation,
          status: order.status,
        });

        // TODO: Send notification or create alert
      }

      return { status: 'verified', orderStatus: order.status };
    } catch (error) {
      log.error('Failed to verify order', { orderId: id, error });
      throw error;
    }
  }

  /**
   * Set up worker event listeners
   */
  private setupWorkerEvents(): void {
    this.worker.on('completed', (job) => {
      log.debug('Verification job completed', { jobId: job.id, name: job.name });
    });

    this.worker.on('failed', (job, error) => {
      log.error('Verification job failed', {
        jobId: job?.id,
        name: job?.name,
        error: error.message,
      });
    });

    this.worker.on('error', (error) => {
      log.error('Verification worker error', error);
    });
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    log.info('VerificationProcessor closed');
  }
}
