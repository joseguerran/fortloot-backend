import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config';
import { log } from '../utils/logger';
import { FriendshipJobData, GiftJobData } from '../types';
import { prisma } from '../database/client';

/**
 * Manages BullMQ queues for bot operations
 */
export class QueueManager {
  private redis: Redis;
  public friendshipQueue: Queue<FriendshipJobData['data']>;
  public giftQueue: Queue<GiftJobData['data']>;
  public verificationQueue: Queue;
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      maxRetriesPerRequest: null,
    });

    // Initialize queues
    this.friendshipQueue = new Queue('friendship', {
      connection: this.redis,
      defaultJobOptions: {
        attempts: config.queue.maxRetries,
        backoff: {
          type: 'exponential',
          delay: config.queue.retryDelay,
        },
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24 hours
          count: 1000,
        },
        removeOnFail: {
          age: 604800, // Keep failed jobs for 7 days
        },
      },
    });

    this.giftQueue = new Queue('gift', {
      connection: this.redis,
      defaultJobOptions: {
        attempts: config.queue.maxRetries,
        backoff: {
          type: 'exponential',
          delay: config.queue.retryDelay,
        },
        removeOnComplete: {
          age: 86400,
          count: 1000,
        },
        removeOnFail: {
          age: 604800,
        },
      },
    });

    this.verificationQueue = new Queue('verification', {
      connection: this.redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 30000, // 30 seconds
        },
        removeOnComplete: {
          age: 3600, // 1 hour
          count: 100,
        },
        removeOnFail: false, // Keep all failed verification jobs
      },
    });

    // Set up queue event listeners
    this.setupQueueEvents();

    log.info('Queue manager initialized', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
      },
    });
  }

  /**
   * Set up event listeners for queues
   */
  private setupQueueEvents(): void {
    const queues = [
      { name: 'friendship', queue: this.friendshipQueue },
      { name: 'gift', queue: this.giftQueue },
      { name: 'verification', queue: this.verificationQueue },
    ];

    for (const { name, queue } of queues) {
      const events = new QueueEvents(name, { connection: this.redis });
      this.queueEvents.set(name, events);

      events.on('completed', ({ jobId }) => {
        log.debug(`Job completed in ${name} queue`, { jobId });
      });

      events.on('failed', ({ jobId, failedReason }) => {
        log.error(`Job failed in ${name} queue`, { jobId, failedReason });
      });

      events.on('stalled', ({ jobId }) => {
        log.warn(`Job stalled in ${name} queue`, { jobId });
      });
    }
  }

  /**
   * Add friendship job to queue
   */
  async addFriendshipJob(data: FriendshipJobData['data']): Promise<string> {
    const job = await this.friendshipQueue.add(
      'process-friendship',
      data,
      {
        priority: data.orderId ? 2 : 1, // Higher priority if linked to an order
      }
    );

    log.friendship.requested(data.botId, data.epicAccountId, { jobId: job.id });

    return job.id!;
  }

  /**
   * Add gift job to queue
   */
  async addGiftJob(data: GiftJobData['data'], priority: number = 2): Promise<string> {
    const job = await this.giftQueue.add('send-gift', data, {
      priority,
    });

    log.gift.queued(job.id!, { orderId: data.orderId });

    return job.id!;
  }

  /**
   * Add order to queue by fetching order details and creating gift jobs
   */
  async addOrderToQueue(orderId: string): Promise<void> {
    try {
      // Fetch order with related data
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: true,
          orderItems: {
            include: {
              catalogItem: true,
            },
          },
        },
      });

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      if (!order.customer) {
        throw new Error(`Order ${orderId} has no associated customer`);
      }

      if (!order.orderItems || order.orderItems.length === 0) {
        throw new Error(`Order ${orderId} has no items`);
      }

      log.info(`Processing order ${orderId} with ${order.orderItems.length} items`, {
        orderId,
        customerEpicId: order.customer.epicAccountId,
        itemCount: order.orderItems.length,
      });

      // Get priority value for job
      const priorityValue = this.getPriorityValue(order.priority);

      // Create gift job for each order item
      for (const orderItem of order.orderItems) {
        if (!orderItem.catalogItem) {
          log.warn(`OrderItem ${orderItem.id} has no catalogItem, skipping`, {
            orderId,
            orderItemId: orderItem.id,
          });
          continue;
        }

        // Create gift job
        await this.addGiftJob(
          {
            orderId: order.id,
            recipientEpicId: order.customer.epicAccountId,
            recipientName: order.customer.displayName,
            itemId: orderItem.catalogItem.itemId || orderItem.itemId,
            itemName: orderItem.productName,
            productType: orderItem.productType,
          },
          priorityValue
        );

        log.info(`Gift job created for order item`, {
          orderId,
          itemId: orderItem.catalogItem.itemId || orderItem.itemId,
          itemName: orderItem.productName,
        });
      }

      // Update order status to QUEUED
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'QUEUED',
        },
      });

      // Track progress
      const { OrderProgressTracker } = await import('../services/OrderProgressTracker');
      await OrderProgressTracker.update(orderId, 'QUEUED', 'Orden encolada para procesamiento');

      log.info(`Order ${orderId} successfully queued for processing`);
    } catch (error) {
      log.error(`Failed to add order ${orderId} to queue`, {
        orderId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get numeric priority value from OrderPriority enum
   */
  private getPriorityValue(priority: string): number {
    switch (priority) {
      case 'VIP':
        return 1; // Highest priority
      case 'HIGH':
        return 2;
      case 'NORMAL':
        return 3;
      case 'LOW':
        return 4;
      default:
        return 3; // Default to NORMAL
    }
  }

  /**
   * Add verification job to queue
   */
  async addVerificationJob(
    type: 'friendship' | 'order',
    data: { id: string; [key: string]: any }
  ): Promise<string> {
    const job = await this.verificationQueue.add(`verify-${type}`, data);

    log.debug('Verification job added', { jobId: job.id, type });

    return job.id!;
  }

  /**
   * Schedule a delayed job
   */
  async scheduleJob(
    queueName: 'friendship' | 'gift' | 'verification',
    jobName: string,
    data: any,
    delay: number
  ): Promise<string> {
    let queue: Queue;

    switch (queueName) {
      case 'friendship':
        queue = this.friendshipQueue;
        break;
      case 'gift':
        queue = this.giftQueue;
        break;
      case 'verification':
        queue = this.verificationQueue;
        break;
    }

    const job = await queue.add(jobName, data, {
      delay,
    });

    log.debug('Job scheduled', {
      jobId: job.id,
      queueName,
      jobName,
      delayMs: delay,
    });

    return job.id!;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string) {
    let queue: Queue;

    switch (queueName) {
      case 'friendship':
        queue = this.friendshipQueue;
        break;
      case 'gift':
        queue = this.giftQueue;
        break;
      case 'verification':
        queue = this.verificationQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const [friendship, gift, verification] = await Promise.all([
      this.getQueueStats('friendship'),
      this.getQueueStats('gift'),
      this.getQueueStats('verification'),
    ]);

    return {
      friendship,
      gift,
      verification,
    };
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<void> {
    let queue: Queue;

    switch (queueName) {
      case 'friendship':
        queue = this.friendshipQueue;
        break;
      case 'gift':
        queue = this.giftQueue;
        break;
      case 'verification':
        queue = this.verificationQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    await queue.pause();
    log.info(`Queue paused: ${queueName}`);
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<void> {
    let queue: Queue;

    switch (queueName) {
      case 'friendship':
        queue = this.friendshipQueue;
        break;
      case 'gift':
        queue = this.giftQueue;
        break;
      case 'verification':
        queue = this.verificationQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    await queue.resume();
    log.info(`Queue resumed: ${queueName}`);
  }

  /**
   * Clean old jobs from a queue
   */
  async cleanQueue(queueName: string, grace: number = 86400000): Promise<void> {
    let queue: Queue;

    switch (queueName) {
      case 'friendship':
        queue = this.friendshipQueue;
        break;
      case 'gift':
        queue = this.giftQueue;
        break;
      case 'verification':
        queue = this.verificationQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${queueName}`);
    }

    await queue.clean(grace, 100, 'completed');
    await queue.clean(grace * 7, 100, 'failed');

    log.info(`Queue cleaned: ${queueName}`, { graceMs: grace });
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.friendshipQueue.close();
    await this.giftQueue.close();
    await this.verificationQueue.close();

    for (const events of this.queueEvents.values()) {
      await events.close();
    }

    await this.redis.quit();

    log.info('Queue manager closed');
  }
}

// Export singleton instance
export const queueManager = new QueueManager();
