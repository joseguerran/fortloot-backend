import { Router } from 'express';
import { MonitoringController } from '../controllers/MonitoringController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireRole, requireAdmin } from '../middleware/rbac';
import { apiRateLimiter, analyticsRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// All monitoring routes require authentication
router.use(authenticate);
router.use(apiRateLimiter);

/**
 * System Health
 */

// Get overall system health - VIEWER can access
router.get(
  '/health',
  requireRole('VIEWER'),
  asyncHandler(MonitoringController.getSystemHealth)
);

// Get bot pool statistics - VIEWER can access
router.get(
  '/pool/stats',
  requireRole('VIEWER'),
  asyncHandler(MonitoringController.getPoolStats)
);

/**
 * Metrics & Analytics
 */

// Get bot metrics - VIEWER can access
router.get(
  '/metrics/bots',
  requireRole('VIEWER'),
  analyticsRateLimiter,
  asyncHandler(MonitoringController.getBotMetrics)
);

// Get system analytics - VIEWER can access
router.get(
  '/analytics',
  requireRole('VIEWER'),
  analyticsRateLimiter,
  asyncHandler(MonitoringController.getAnalytics)
);

/**
 * Audit Logs
 */

// Get audit logs - ADMIN only
router.get(
  '/audit-logs',
  requireAdmin,
  asyncHandler(MonitoringController.getAuditLogs)
);

/**
 * Alerts Configuration
 */

// Get alert configuration - OPERATOR can access
router.get(
  '/alerts/config',
  requireRole('OPERATOR'),
  asyncHandler(MonitoringController.getAlertConfig)
);

// Update alert configuration - ADMIN only
router.put(
  '/alerts/config',
  requireAdmin,
  asyncHandler(MonitoringController.updateAlertConfig)
);

// Trigger manual health check - OPERATOR can access
router.post(
  '/health/check',
  requireRole('OPERATOR'),
  asyncHandler(MonitoringController.triggerHealthCheck)
);

/**
 * Webhooks
 */

// Test webhook - ADMIN only
router.post(
  '/webhooks/test',
  requireAdmin,
  asyncHandler(MonitoringController.testWebhook)
);

/**
 * Error Monitoring
 */

// Get recent errors - OPERATOR can access
router.get(
  '/errors/recent',
  requireRole('OPERATOR'),
  asyncHandler(MonitoringController.getRecentErrors)
);

/**
 * Real-time Streaming
 */

// Server-Sent Events for real-time metrics - VIEWER can access
router.get(
  '/stream',
  requireRole('VIEWER'),
  asyncHandler(MonitoringController.streamMetrics)
);

export { router as monitoringRoutes };
