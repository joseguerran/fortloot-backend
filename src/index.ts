import { config } from './config';
import { log } from './utils/logger';
import { prisma } from './database/client';
import { botManager } from './bots/BotManager';
import { queueManager } from './queue/QueueManager';
import { FriendshipProcessor } from './queue/processors/FriendshipProcessor';
import { GiftProcessor } from './queue/processors/GiftProcessor';
import { VerificationProcessor } from './queue/processors/VerificationProcessor';
import { createServer, startServer } from './api/server';
import { isOperationalError } from './utils/errors';
import { initializeScheduledJobs } from './jobs/scheduledJobs';
import { FileManagementService } from './services/FileManagementService';

/**
 * Main application entry point
 */
class FortlootBotApp {
  private server: any;
  private friendshipProcessor: FriendshipProcessor | null = null;
  private giftProcessor: GiftProcessor | null = null;
  private verificationProcessor: VerificationProcessor | null = null;

  async start() {
    try {
      log.system.startup({ service: 'FortlootBot' });

      // Initialize file management
      await FileManagementService.initializeDirectories();

      // Initialize database
      await this.initializeDatabase();

      // Initialize bot manager
      await botManager.start();

      // Initialize queue processors
      this.friendshipProcessor = new FriendshipProcessor();
      this.giftProcessor = new GiftProcessor();
      this.verificationProcessor = new VerificationProcessor();

      // Start API server
      const app = createServer();
      await startServer(app);
      this.server = app;

      // Initialize scheduled jobs
      initializeScheduledJobs();

      log.info('🚀 Fortloot Bot System started successfully!');
      log.info(`📡 API Server listening on port ${config.server.port}`);
      log.info(`🤖 Bot Manager initialized with ${botManager.getPoolStats().total} bots`);
      log.info(`📋 Queue system ready`);
      log.info(`⏰ Scheduled jobs initialized`);

      // Set up graceful shutdown
      this.setupGracefulShutdown();
    } catch (error) {
      log.system.error('Failed to start application', error);
      process.exit(1);
    }
  }

  private async initializeDatabase() {
    try {
      log.info('Connecting to database...');
      await prisma.$connect();
      log.info('✓ Database connected');

      // Run migrations if needed
      // Note: In production, run migrations separately
      // await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      log.error('Database connection failed', error);
      throw error;
    }
  }

  private setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
      log.system.shutdown({ signal });

      try {
        // Stop accepting new requests
        if (this.server) {
          await new Promise((resolve) => {
            this.server.close(resolve);
          });
        }

        // Close queue processors
        if (this.friendshipProcessor) {
          await this.friendshipProcessor.close();
        }
        if (this.giftProcessor) {
          await this.giftProcessor.close();
        }
        if (this.verificationProcessor) {
          await this.verificationProcessor.close();
        }

        // Close queue manager
        await queueManager.close();

        // Stop bot manager
        await botManager.stop();

        // Close database connection
        await prisma.$disconnect();

        log.info('✓ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        log.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      log.error('Uncaught exception', error);

      if (!isOperationalError(error)) {
        log.error('Non-operational error, shutting down');
        shutdown('uncaughtException');
      }
    });

    process.on('unhandledRejection', (reason: any) => {
      log.error('Unhandled rejection', { reason });

      if (!isOperationalError(reason)) {
        log.error('Non-operational error, shutting down');
        shutdown('unhandledRejection');
      }
    });
  }
}

// Start the application
const app = new FortlootBotApp();
app.start();
