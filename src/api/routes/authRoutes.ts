import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

/**
 * Public authentication routes
 */

// Health check endpoint for API key validation
router.get(
  '/health',
  authenticate,
  (req, res) => {
    res.status(200).json({
      success: true,
      data: { status: 'ok', authenticated: true }
    });
  }
);

// Login with username and password
router.post(
  '/login',
  authRateLimiter, // Strict rate limiting for auth
  asyncHandler(AuthController.login)
);

/**
 * Authenticated routes
 */

// Get current user info
router.get(
  '/me',
  authenticate,
  asyncHandler(AuthController.me)
);

// Logout (for audit trail)
router.post(
  '/logout',
  authenticate,
  auditLog('USER_LOGOUT', 'User'),
  asyncHandler(AuthController.logout)
);

// Change own password
router.post(
  '/change-password',
  authenticate,
  asyncHandler(AuthController.changePassword)
);

export { router as authRoutes };
