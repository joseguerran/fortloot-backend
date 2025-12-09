import { Router } from 'express';
import { PaymentMethodController } from '../controllers/PaymentMethodController';
import { PaymentMethodConfigController } from '../controllers/PaymentMethodConfigController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { apiRateLimiter, publicRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

// Protected routes (require authentication)
router.use(authenticate);
router.use(apiRateLimiter);

// Get all payment methods (store needs this)
router.get(
  '/',
  asyncHandler(PaymentMethodController.getAll)
);

// Get payment method by slug (store needs this)
router.get(
  '/slug/:slug',
  asyncHandler(PaymentMethodController.getBySlug)
);

// Get payment method by slug with configs (store needs this for checkout)
router.get(
  '/slug/:slug/with-configs',
  asyncHandler(PaymentMethodConfigController.getWithConfigsBySlug)
);

// Get payment method by ID (store needs this)
router.get(
  '/:id',
  asyncHandler(PaymentMethodController.getById)
);

// Get payment method with configs (public endpoint for checkout)
router.get(
  '/:id/with-configs',
  asyncHandler(PaymentMethodConfigController.getWithConfigs)
);

// Apply price configs (public endpoint for checkout)
router.get(
  '/:id/price',
  asyncHandler(PaymentMethodConfigController.applyPrice)
);

// Get configs for a payment method (public read)
router.get(
  '/:id/configs',
  asyncHandler(PaymentMethodConfigController.getConfigs)
);

// Get specific config by type (public read)
router.get(
  '/:id/configs/:type',
  asyncHandler(PaymentMethodConfigController.getConfigByType)
);

// Admin-only routes
router.use(requireAdmin);

// Create payment method
router.post(
  '/',
  auditLog('PAYMENT_METHOD_CREATE', 'PaymentMethod'),
  asyncHandler(PaymentMethodController.create)
);

// Update payment method
router.patch(
  '/:id',
  auditLog('PAYMENT_METHOD_UPDATE', 'PaymentMethod'),
  asyncHandler(PaymentMethodController.update)
);

// Delete payment method
router.delete(
  '/:id',
  auditLog('PAYMENT_METHOD_DELETE', 'PaymentMethod'),
  asyncHandler(PaymentMethodController.delete)
);

// Toggle active status
router.patch(
  '/:id/toggle',
  auditLog('PAYMENT_METHOD_TOGGLE', 'PaymentMethod'),
  asyncHandler(PaymentMethodController.toggleActive)
);

// Reorder payment methods
router.post(
  '/reorder',
  auditLog('PAYMENT_METHOD_REORDER', 'PaymentMethod'),
  asyncHandler(PaymentMethodController.reorder)
);

// ============================================================================
// Payment Method Config Routes (Admin only)
// ============================================================================

// Create or update config
router.put(
  '/:id/configs/:type',
  auditLog('PAYMENT_METHOD_CONFIG_UPSERT', 'PaymentMethodConfig'),
  asyncHandler(PaymentMethodConfigController.upsertConfig)
);

// Delete config
router.delete(
  '/:id/configs/:type',
  auditLog('PAYMENT_METHOD_CONFIG_DELETE', 'PaymentMethodConfig'),
  asyncHandler(PaymentMethodConfigController.deleteConfig)
);

// Toggle config enabled/disabled
router.patch(
  '/:id/configs/:type/toggle',
  auditLog('PAYMENT_METHOD_CONFIG_TOGGLE', 'PaymentMethodConfig'),
  asyncHandler(PaymentMethodConfigController.toggleConfig)
);

export { router as paymentMethodRoutes };
