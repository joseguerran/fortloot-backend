import { Router } from 'express';
import { PaymentMethodController } from '../controllers/PaymentMethodController';
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

// Get payment method by ID (store needs this)
router.get(
  '/:id',
  asyncHandler(PaymentMethodController.getById)
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

export { router as paymentMethodRoutes };
