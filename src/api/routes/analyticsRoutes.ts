import { Router } from 'express';
import { AnalyticsController } from '../controllers/AnalyticsController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get metrics
router.get('/metrics', asyncHandler(AnalyticsController.getMetrics));

// Get queue stats
router.get('/queues', asyncHandler(AnalyticsController.getQueueStats));

// Get system health
router.get('/health', asyncHandler(AnalyticsController.getSystemHealth));

// Get checkout abandonment analytics
router.get('/checkout-abandonment', asyncHandler(AnalyticsController.getCheckoutAbandonment));

export { router as analyticsRoutes };
