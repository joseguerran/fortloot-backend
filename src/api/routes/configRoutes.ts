import { Router } from 'express';
import { ConfigController } from '../controllers/ConfigController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { publicRateLimiter, apiRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

// Public route for checkout mode GET (needed by frontend)
router.get(
  '/checkout-mode',
  publicRateLimiter,
  asyncHandler(ConfigController.getCheckoutMode)
);

// Protected route for checkout mode PUT (must be before general auth middleware)
router.put(
  '/checkout-mode',
  authenticate,
  requireAdmin,
  apiRateLimiter,
  auditLog('CHECKOUT_MODE_UPDATE', 'Config'),
  asyncHandler(ConfigController.setCheckoutMode)
);

// Public route for manual checkout GET (needed by frontend)
router.get(
  '/manual-checkout',
  publicRateLimiter,
  asyncHandler(ConfigController.getManualCheckout)
);

// Protected route for manual checkout PUT
router.put(
  '/manual-checkout',
  authenticate,
  requireAdmin,
  apiRateLimiter,
  auditLog('MANUAL_CHECKOUT_UPDATE', 'Config'),
  asyncHandler(ConfigController.setManualCheckout)
);

// Protected routes (require authentication and admin role)
router.use(authenticate);
router.use(apiRateLimiter);
router.use(requireAdmin);

// Get all configurations
router.get(
  '/',
  asyncHandler(ConfigController.getAll)
);

// Get configuration by key
router.get(
  '/:key',
  asyncHandler(ConfigController.get)
);

// Set configuration value
router.put(
  '/:key',
  auditLog('CONFIG_UPDATE', 'Config'),
  asyncHandler(ConfigController.set)
);

// Delete configuration
router.delete(
  '/:key',
  auditLog('CONFIG_DELETE', 'Config'),
  asyncHandler(ConfigController.delete)
);

export { router as configRoutes };
