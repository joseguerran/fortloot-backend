import { Router } from 'express';
import { CustomerController } from '../controllers/CustomerController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireRole, requireAdmin } from '../middleware/rbac';
import { apiRateLimiter, publicRateLimiter, epicAccountRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';
import { checkBlacklist } from '../middleware/blacklistCheck';
import { validate } from '../middleware/validate';
import {
  createCustomerSessionSchema,
  verifyFriendshipSchema,
  changeTierSchema,
  blacklistCustomerSchema,
  removeFromBlacklistSchema,
} from '../../validation/schemas';

const router = Router();

// Public routes (no auth required)
router.post(
  '/session',
  publicRateLimiter,
  epicAccountRateLimiter,
  validate(createCustomerSessionSchema),
  checkBlacklist,
  asyncHandler(CustomerController.createSession)
);

router.get(
  '/verify-friendship',
  publicRateLimiter,
  epicAccountRateLimiter,
  validate(verifyFriendshipSchema),
  asyncHandler(CustomerController.verifyFriendship)
);

// Protected routes (require authentication)
router.use(authenticate);
router.use(apiRateLimiter);

// Get customer stats
router.get(
  '/:epicId/stats',
  requireRole('VIEWER'),
  asyncHandler(CustomerController.getCustomerStats)
);

// List all customers (admin)
router.get(
  '/',
  requireRole('VIEWER'),
  asyncHandler(CustomerController.listCustomers)
);

// Change customer tier (admin only)
router.patch(
  '/:id/tier',
  requireAdmin,
  validate(changeTierSchema),
  auditLog('CUSTOMER_TIER_CHANGE', 'Customer'),
  asyncHandler(CustomerController.changeTier)
);

// Blacklist operations (admin only)
router.post(
  '/:id/blacklist',
  requireAdmin,
  validate(blacklistCustomerSchema),
  auditLog('CUSTOMER_BLACKLIST', 'Customer'),
  asyncHandler(CustomerController.addToBlacklist)
);

router.delete(
  '/:id/blacklist',
  requireAdmin,
  validate(removeFromBlacklistSchema),
  auditLog('CUSTOMER_UNBLACKLIST', 'Customer'),
  asyncHandler(CustomerController.removeFromBlacklist)
);

export { router as customerRoutes };
