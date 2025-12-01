import { Router } from 'express';
import { CryptoPaymentController } from '../controllers/CryptoPaymentController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { apiRateLimiter, publicRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// =====================================
// Public routes (no authentication)
// =====================================

// Check if crypto payments are available
router.get(
  '/availability',
  publicRateLimiter,
  asyncHandler(CryptoPaymentController.checkAvailability)
);

// Create a crypto invoice for an order
router.post(
  '/create-invoice',
  publicRateLimiter,
  asyncHandler(CryptoPaymentController.createInvoice)
);

// Get crypto payment status for an order
router.get(
  '/status/:orderId',
  publicRateLimiter,
  asyncHandler(CryptoPaymentController.getStatus)
);

// Regenerate crypto invoice (allows changing currency/network)
router.post(
  '/regenerate/:orderId',
  publicRateLimiter,
  asyncHandler(CryptoPaymentController.regenerateInvoice)
);

// =====================================
// Admin routes (require authentication)
// =====================================
router.use(authenticate);
router.use(apiRateLimiter);
router.use(requireAdmin);

// Get all crypto payments (admin view)
router.get(
  '/payments',
  asyncHandler(CryptoPaymentController.getAllPayments)
);

// Get crypto payment by ID
router.get(
  '/payments/:id',
  asyncHandler(CryptoPaymentController.getPaymentById)
);

// Refresh payment status from Cryptomus
router.post(
  '/payments/:id/refresh',
  asyncHandler(CryptoPaymentController.refreshStatus)
);

export { router as cryptoPaymentRoutes };
