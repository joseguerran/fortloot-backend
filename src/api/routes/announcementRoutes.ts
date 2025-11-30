import { Router } from 'express';
import { AnnouncementController } from '../controllers/AnnouncementController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { publicRateLimiter, apiRateLimiter, uploadRateLimiter } from '../middleware/rateLimiter';
import multer from 'multer';

const router = Router();

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  },
});

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

// Upload image for announcement (admin)
router.post(
  '/upload-image',
  uploadRateLimiter,
  upload.single('image'),
  asyncHandler(AnnouncementController.uploadImage)
);

export { router as announcementRoutes };
