import cron from 'node-cron';
import { MetricsService } from '../services/MetricsService';
import { FileManagementService } from '../services/FileManagementService';
import { CatalogController } from '../api/controllers/CatalogController';
import { log } from '../utils/logger';

/**
 * Initialize all scheduled CRON jobs
 */
export function initializeScheduledJobs() {
  log.info('Initializing scheduled jobs...');

  // Daily metrics snapshot - Every day at midnight
  cron.schedule('0 0 * * *', async () => {
    log.info('Running daily metrics snapshot job...');
    try {
      await MetricsService.storeDailyMetrics();
      log.info('Daily metrics snapshot completed');
    } catch (error) {
      log.error('Error in daily metrics snapshot job:', error);
    }
  });

  // Cleanup expired orders - Every hour
  cron.schedule('0 * * * *', async () => {
    log.info('Running expired orders cleanup job...');
    try {
      await MetricsService.cleanupExpiredOrders();
      log.info('Expired orders cleanup completed');
    } catch (error) {
      log.error('Error in expired orders cleanup job:', error);
    }
  });

  // Process pending friendships - Every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    log.info('Running pending friendships processing job...');
    try {
      await MetricsService.processPendingFriendships();
      log.info('Pending friendships processing completed');
    } catch (error) {
      log.error('Error in pending friendships processing job:', error);
    }
  });

  // Auto-tier customers - Every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    log.info('Running auto-tier customers job...');
    try {
      await MetricsService.autoTierCustomers();
      log.info('Auto-tier customers completed');
    } catch (error) {
      log.error('Error in auto-tier customers job:', error);
    }
  });

  // Update catalog from Fortnite API - Every day at 1 AM (after shop rotation)
  cron.schedule('0 1 * * *', async () => {
    log.info('Running catalog update job...');
    try {
      // Call the catalog sync method directly
      const result = await CatalogController.syncCatalogFromAPI();
      log.info(`Catalog update completed: ${result.itemCount} items (${result.newItems} new, ${result.updatedItems} updated)`);
    } catch (error) {
      log.error('Error in catalog update job:', error);
    }
  });

  // General maintenance - Every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    log.info('Running scheduled maintenance...');
    try {
      await MetricsService.runScheduledMaintenance();
      log.info('Scheduled maintenance completed');
    } catch (error) {
      log.error('Error in scheduled maintenance job:', error);
    }
  });

  // Cleanup old payment proofs - Every day at 3 AM
  cron.schedule('0 3 * * *', async () => {
    log.info('Running file cleanup job...');
    try {
      const result = await FileManagementService.cleanupOldFiles();
      log.info(`File cleanup completed: ${result.deleted} files deleted, ${result.errors} errors`);
    } catch (error) {
      log.error('Error in file cleanup job:', error);
    }
  });

  log.info('All scheduled jobs initialized successfully');
}
