import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../../config';
import { log } from '../../utils/logger';
import { prisma } from '../../database/client';
import { botManager } from '../../bots/BotManager';
import { FriendshipStatus } from '@prisma/client';
import { FriendRequest } from '../../types';
import { calculateCanGiftAt } from '../../utils/helpers';
import { queueManager } from '../QueueManager';

/**
 * Processor for friendship queue
 * Handles friend requests and tracks 48-hour wait period
 */
export class FriendshipProcessor {
  private worker: Worker;

  constructor() {
    const connection = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker(
      'friendship',
      async (job: Job<FriendRequest>) => {
        return await this.processFriendship(job);
      },
      {
        connection,
        concurrency: config.queue.concurrency,
        limiter: {
          max: 10,
          duration: 60000, // 10 requests per minute to avoid rate limiting
        },
      }
    );

    this.setupWorkerEvents();

    log.info('FriendshipProcessor initialized', {
      concurrency: config.queue.concurrency,
    });
  }

  /**
   * Process a friendship job
   */
  private async processFriendship(job: Job<FriendRequest>): Promise<any> {
    const { botId, epicAccountId, displayName, orderId } = job.data;

    log.friendship.requested(botId, epicAccountId, { jobId: job.id, orderId });

    try {
      // Check if friendship already exists
      const existingFriendship = await prisma.friendship.findUnique({
        where: {
          botId_epicAccountId: {
            botId,
            epicAccountId,
          },
        },
      });

      if (existingFriendship) {
        // Friendship exists, check status
        if (existingFriendship.status === FriendshipStatus.READY) {
          log.friendship.ready(botId, epicAccountId, { status: 'already_ready' });
          return { status: 'exists', friendshipId: existingFriendship.id };
        }

        // Update if needed
        return { status: 'exists', friendshipId: existingFriendship.id };
      }

      // Get bot client
      const botClient = botManager.getBot(botId);

      // Send friend request
      await botClient.addFriend(epicAccountId);

      // Create friendship record
      const friendedAt = new Date();
      const canGiftAt = calculateCanGiftAt(friendedAt, config.bot.friendshipWaitHours);

      const friendship = await prisma.friendship.create({
        data: {
          botId,
          epicAccountId,
          displayName,
          status: FriendshipStatus.PENDING,
          friendedAt,
          canGiftAt,
          requestedBy: orderId,
        },
      });

      log.friendship.requested(botId, epicAccountId, {
        friendshipId: friendship.id,
        canGiftAt,
      });

      // Schedule verification job to check if accepted
      await queueManager.addVerificationJob('friendship', {
        id: friendship.id,
        botId,
        epicAccountId,
      });

      return { status: 'requested', friendshipId: friendship.id };
    } catch (error) {
      log.error('Failed to process friendship', {
        botId,
        epicAccountId,
        jobId: job.id,
        error,
      });

      // Update order if linked
      if (orderId) {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            status: 'FAILED',
            failureReason: `Failed to add friend: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
            failedAt: new Date(),
          },
        });
      }

      throw error;
    }
  }

  /**
   * Set up worker event listeners
   */
  private setupWorkerEvents(): void {
    this.worker.on('completed', (job) => {
      log.debug('Friendship job completed', { jobId: job.id });
    });

    this.worker.on('failed', (job, error) => {
      log.error('Friendship job failed', {
        jobId: job?.id,
        error: error.message,
      });
    });

    this.worker.on('error', (error) => {
      log.error('Friendship worker error', error);
    });
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    log.info('FriendshipProcessor closed');
  }
}
