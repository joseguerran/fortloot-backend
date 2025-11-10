import { Router } from 'express';
import { BotController } from '../controllers/BotController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireRole, requireAdmin, requireOperator } from '../middleware/rbac';
import {
  publicRateLimiter,
  apiRateLimiter,
  botOperationRateLimiter,
  botCreationRateLimiter,
  credentialsUpdateRateLimiter,
} from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

// Public route - no auth required, public rate limit
router.get(
  '/availability',
  publicRateLimiter,
  asyncHandler(BotController.getAvailability)
);

// All other routes require authentication and general rate limiting
router.use(authenticate);
router.use(apiRateLimiter);

// Get all bots - VIEWER can access
router.get(
  '/',
  requireRole('VIEWER'),
  asyncHandler(BotController.getAllBots)
);

// Get bot by ID - VIEWER can access
router.get(
  '/:botId',
  requireRole('VIEWER'),
  asyncHandler(BotController.getBot)
);

// Add new bot - ADMIN only, rate limited, audited
router.post(
  '/',
  requireAdmin,
  botCreationRateLimiter,
  auditLog('BOT_CREATE', 'Bot'),
  asyncHandler(BotController.addBot)
);

// Update bot settings - ADMIN only, audited
router.patch(
  '/:botId',
  requireAdmin,
  auditLog('BOT_UPDATE', 'Bot'),
  asyncHandler(BotController.updateBot)
);

// Remove bot - ADMIN only, audited
router.delete(
  '/:botId',
  requireAdmin,
  auditLog('BOT_DELETE', 'Bot'),
  asyncHandler(BotController.removeBot)
);

// Get bot health - VIEWER can access
router.get(
  '/:botId/health',
  requireRole('VIEWER'),
  asyncHandler(BotController.getBotHealth)
);

// Get bot friends - VIEWER can access
router.get(
  '/:botId/friends',
  requireRole('VIEWER'),
  asyncHandler(BotController.getBotFriends)
);

// Get bot activities - VIEWER can access
router.get(
  '/:botId/activities',
  requireRole('VIEWER'),
  asyncHandler(BotController.getBotActivities)
);

// Sync bot friends from Epic API - OPERATOR can access, rate limited, audited
router.post(
  '/:botId/sync-friends',
  requireOperator,
  botOperationRateLimiter,
  auditLog('BOT_SYNC_FRIENDS', 'Bot'),
  asyncHandler(BotController.syncBotFriends)
);

// Bot lifecycle management - OPERATOR can access, rate limited, audited
router.post(
  '/:botId/login',
  requireOperator,
  botOperationRateLimiter,
  auditLog('BOT_LOGIN', 'Bot'),
  asyncHandler(BotController.loginBot)
);

router.post(
  '/:botId/logout',
  requireOperator,
  botOperationRateLimiter,
  auditLog('BOT_LOGOUT', 'Bot'),
  asyncHandler(BotController.logoutBot)
);

router.post(
  '/:botId/restart',
  requireOperator,
  botOperationRateLimiter,
  auditLog('BOT_RESTART', 'Bot'),
  asyncHandler(BotController.restartBot)
);

// Update bot credentials - ADMIN only, strictly rate limited, audited
router.put(
  '/:botId/credentials',
  requireAdmin,
  credentialsUpdateRateLimiter,
  auditLog('BOT_CREDENTIALS_UPDATE', 'Bot'),
  asyncHandler(BotController.updateCredentials)
);

// Send test message - OPERATOR can access (for debugging)
router.post(
  '/:botId/test-message',
  requireOperator,
  botOperationRateLimiter,
  asyncHandler(BotController.sendTestMessage)
);

// Send gift with validation - OPERATOR can access
router.post(
  '/:botId/send-gift',
  requireOperator,
  botOperationRateLimiter,
  auditLog('BOT_SEND_GIFT', 'Bot'),
  asyncHandler(BotController.sendGiftWithValidation)
);

export { router as botRoutes };
