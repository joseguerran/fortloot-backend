import { Router } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { apiRateLimiter, publicRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';
import { validate } from '../middleware/validate';
import {
  uploadProofSchema,
  getPendingVerificationsSchema,
  verifyPaymentSchema,
  getPaymentHistorySchema,
  getPaymentStatsSchema,
  retryPaymentSchema,
} from '../../validation/schemas';
import multer from 'multer';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG images or PDF files are allowed'));
    }
    cb(null, true);
  },
});

// Public routes (customer actions - no auth required, but validated by order ownership)
router.post(
  '/orders/:orderId/proof',
  publicRateLimiter,
  uploadRateLimiter,
  upload.single('paymentProof'),
  validate(uploadProofSchema),
  asyncHandler(PaymentController.uploadProof)
);

router.post(
  '/orders/:orderId/retry',
  publicRateLimiter,
  validate(retryPaymentSchema),
  asyncHandler(PaymentController.retryPayment)
);

// Protected routes (require authentication)
router.use(authenticate);
router.use(apiRateLimiter);

// Get pending verifications (viewer can see)
router.get(
  '/pending',
  requireRole('VIEWER'),
  validate(getPendingVerificationsSchema),
  asyncHandler(PaymentController.getPendingVerifications)
);

// Get payment history (viewer can see)
router.get(
  '/orders/:orderId/history',
  requireRole('VIEWER'),
  validate(getPaymentHistorySchema),
  asyncHandler(PaymentController.getPaymentHistory)
);

// Get payment statistics (viewer can see)
router.get(
  '/stats',
  requireRole('VIEWER'),
  validate(getPaymentStatsSchema),
  asyncHandler(PaymentController.getPaymentStats)
);

// Verify payment (admin only)
router.post(
  '/orders/:orderId/verify',
  requireRole('ADMIN'),
  validate(verifyPaymentSchema),
  auditLog('PAYMENT_VERIFY', 'Order'),
  asyncHandler(PaymentController.verifyPayment)
);

export { router as paymentRoutes };
