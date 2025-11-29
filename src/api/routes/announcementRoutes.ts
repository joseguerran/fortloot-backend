import { Router } from 'express';
import { AnnouncementController } from '../controllers/AnnouncementController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { publicRateLimiter, apiRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// ============================================================================
// Public routes (no authentication required)
// ============================================================================

// Get active announcements (public)
router.get(
  '/active',
  publicRateLimiter,
  asyncHandler(AnnouncementController.getActive)
);

// Get maintenance status (public)
router.get(
  '/maintenance',
  publicRateLimiter,
  asyncHandler(AnnouncementController.getMaintenanceStatus)
);

// ============================================================================
// Protected routes (require authentication and admin role)
// ============================================================================

router.use(authenticate);
router.use(apiRateLimiter);
router.use(requireAdmin);

// Get all announcements (admin)
router.get(
  '/',
  asyncHandler(AnnouncementController.getAll)
);

// Get a single announcement (admin)
router.get(
  '/:id',
  asyncHandler(AnnouncementController.getOne)
);

// Create a new announcement (admin)
router.post(
  '/',
  asyncHandler(AnnouncementController.create)
);

// Update an announcement (admin)
router.patch(
  '/:id',
  asyncHandler(AnnouncementController.update)
);

// Toggle announcement active status (admin)
router.post(
  '/:id/toggle',
  asyncHandler(AnnouncementController.toggle)
);

// Delete an announcement (admin)
router.delete(
  '/:id',
  asyncHandler(AnnouncementController.delete)
);

export { router as announcementRoutes };
