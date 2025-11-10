import { Router } from 'express';
import { PaymentMethodController } from '../controllers/PaymentMethodController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { apiRateLimiter, publicRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

// Public routes (for frontend)
router.get(
  '/',
  publicRateLimiter,
  asyncHandler(PaymentMethodController.getAll)
);

router.get(
  '/slug/:slug',
  publicRateLimiter,
  asyncHandler(PaymentMethodController.getBySlug)
);

router.get(
  '/:id',
  publicRateLimiter,
  asyncHandler(PaymentMethodController.getById)
);

// Protected routes (require authentication and admin role)
router.use(authenticate);
router.use(apiRateLimiter);
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
