import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin, requireSuperAdmin } from '../middleware/rbac';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

// All user management routes require authentication
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
