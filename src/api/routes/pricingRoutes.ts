import { Router } from 'express';
import { PricingController } from '../controllers/PricingController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { apiRateLimiter, publicRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';
import { validate } from '../middleware/validate';
import {
  updatePricingConfigSchema,
  calculatePriceSchema,
  calculateCartTotalSchema,
} from '../../validation/schemas';

const router = Router();

// Public routes
router.get(
  '/config',
  publicRateLimiter,
  asyncHandler(PricingController.getConfig)
);

router.post(
  '/calculate',
  publicRateLimiter,
  validate(calculatePriceSchema),
  asyncHandler(PricingController.calculatePrice)
);

router.post(
  '/calculate-cart',
  publicRateLimiter,
  validate(calculateCartTotalSchema),
  asyncHandler(PricingController.calculateCartTotal)
);

router.get(
  '/discounts',
  publicRateLimiter,
  asyncHandler(PricingController.getDiscounts)
);

// Protected routes (require authentication)
router.use(authenticate);
router.use(apiRateLimiter);

// Update pricing config (admin only)
router.patch(
  '/config',
  requireAdmin,
  validate(updatePricingConfigSchema),
  auditLog('PRICING_CONFIG_UPDATE', 'PricingConfig'),
  asyncHandler(PricingController.updateConfig)
);

export { router as pricingRoutes };
