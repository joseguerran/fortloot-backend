import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireSuperAdmin } from '../middleware/rbac';
import { apiRateLimiter, authRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

/**
 * Public routes for user activation (no auth required)
 */

// Validate invitation token
router.get(
  '/invite/:token',
  authRateLimiter,
  asyncHandler(UserController.getInvitation)
);

// Activate account with password
router.post(
  '/activate',
  authRateLimiter,
  asyncHandler(UserController.activate)
);

/**
 * Protected routes (require authentication)
 */
router.use(authenticate);
router.use(apiRateLimiter);

/**
 * User CRUD operations (ADMIN only)
 */

// Get all users
router.get(
  '/',
  requireAdmin,
  asyncHandler(UserController.getAllUsers)
);

// Get user by ID
router.get(
  '/:userId',
  requireAdmin,
  asyncHandler(UserController.getUser)
);

// Create new user
router.post(
  '/',
  requireAdmin,
  auditLog('USER_CREATE', 'User'),
  asyncHandler(UserController.createUser)
);

// Update user
router.put(
  '/:userId',
  requireAdmin,
  auditLog('USER_UPDATE', 'User'),
  asyncHandler(UserController.updateUser)
);

// Delete user (SUPER_ADMIN only)
router.delete(
  '/:userId',
  requireSuperAdmin,
  auditLog('USER_DELETE', 'User'),
  asyncHandler(UserController.deleteUser)
);

/**
 * User invitation (ADMIN only)
 */

// Invite a new user
router.post(
  '/invite',
  requireAdmin,
  auditLog('USER_INVITE', 'User'),
  asyncHandler(UserController.invite)
);

// Resend invitation to user
router.post(
  '/:userId/resend-invitation',
  requireAdmin,
  auditLog('USER_RESEND_INVITATION', 'User'),
  asyncHandler(UserController.resendInvitation)
);

/**
 * User operations
 */

// Regenerate API key
router.post(
  '/:userId/regenerate-key',
  requireAdmin,
  asyncHandler(UserController.regenerateApiKey)
);

// Reset user password (ADMIN only)
router.post(
  '/:userId/reset-password',
  requireAdmin,
  asyncHandler(UserController.resetPassword)
);

export { router as userRoutes };
