import { Router } from 'express';
import { ConfigController } from '../controllers/ConfigController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { publicRateLimiter, apiRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

// Protected routes (require authentication)
router.use(authenticate);
router.use(apiRateLimiter);

// Get checkout mode (store needs this)
router.get(
  '/checkout-mode',
  asyncHandler(ConfigController.getCheckoutMode)
);

// Set checkout mode (admin only)
router.put(
  '/checkout-mode',
  requireAdmin,
  auditLog('CHECKOUT_MODE_UPDATE', 'Config'),
  asyncHandler(ConfigController.setCheckoutMode)
);

// Get manual checkout (store needs this)
router.get(
  '/manual-checkout',
  asyncHandler(ConfigController.getManualCheckout)
);

// Set manual checkout (admin only)
router.put(
  '/manual-checkout',
  requireAdmin,
  auditLog('MANUAL_CHECKOUT_UPDATE', 'Config'),
  asyncHandler(ConfigController.setManualCheckout)
);

// Get WhatsApp notifications enabled (admin only)
router.get(
  '/whatsapp-enabled',
  requireAdmin,
  asyncHandler(ConfigController.getWhatsAppEnabled)
);

// Set WhatsApp notifications enabled (admin only)
router.put(
  '/whatsapp-enabled',
  requireAdmin,
  auditLog('WHATSAPP_CONFIG_UPDATE', 'Config'),
  asyncHandler(ConfigController.setWhatsAppEnabled)
);

// Additional protected routes (require admin role)
router.use(requireAdmin);

// Get all configurations
router.get(
  '/',
  asyncHandler(ConfigController.getAll)
);

// Get configuration by key
router.get(
  '/:key',
  asyncHandler(ConfigController.get)
);

// Set configuration value
router.put(
  '/:key',
  auditLog('CONFIG_UPDATE', 'Config'),
  asyncHandler(ConfigController.set)
);

// Delete configuration
router.delete(
  '/:key',
  auditLog('CONFIG_DELETE', 'Config'),
  asyncHandler(ConfigController.delete)
);

export { router as configRoutes };
