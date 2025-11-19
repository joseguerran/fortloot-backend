import { Router } from 'express';
import { CatalogController } from '../controllers/CatalogController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireRole, requireAdmin } from '../middleware/rbac';
import { apiRateLimiter, publicRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';
import { validate } from '../middleware/validate';
import {
  getCurrentCatalogSchema,
  getItemsSchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
  deleteCatalogItemSchema,
  createFlashSaleSchema,
} from '../../validation/schemas';

const router = Router();

// Protected routes (require authentication)
router.use(authenticate);
router.use(apiRateLimiter);

// Get current catalog
router.get(
  '/current',
  validate(getCurrentCatalogSchema),
  asyncHandler(CatalogController.getCurrentCatalog)
);

// Get catalog closes at
router.get(
  '/closes-at',
  asyncHandler(CatalogController.getClosesAt)
);

// Search Epic Games catalog
router.get(
  '/search',
  asyncHandler(CatalogController.searchCatalog)
);

// Debug endpoint to check catalog status
router.get(
  '/debug',
  asyncHandler(CatalogController.debugCatalog)
);

// Update catalog (admin only)
router.post(
  '/update',
  requireAdmin,
  auditLog('CATALOG_UPDATE', 'Catalog'),
  asyncHandler(CatalogController.updateCatalog)
);

// Get all items (viewer can see)
router.get(
  '/items',
  requireRole('VIEWER'),
  validate(getItemsSchema),
  asyncHandler(CatalogController.getItems)
);

// Create item (admin only)
router.post(
  '/items',
  requireAdmin,
  validate(createCatalogItemSchema),
  auditLog('CATALOG_ITEM_CREATE', 'CatalogItem'),
  asyncHandler(CatalogController.createItem)
);

// Update item (admin only)
router.patch(
  '/items/:id',
  requireAdmin,
  validate(updateCatalogItemSchema),
  auditLog('CATALOG_ITEM_UPDATE', 'CatalogItem'),
  asyncHandler(CatalogController.updateItem)
);

// Deactivate item (admin only)
router.delete(
  '/items/:id',
  requireAdmin,
  validate(deleteCatalogItemSchema),
  auditLog('CATALOG_ITEM_DELETE', 'CatalogItem'),
  asyncHandler(CatalogController.deleteItem)
);

// Create flash sale (admin only)
router.post(
  '/items/:id/flash-sale',
  requireAdmin,
  validate(createFlashSaleSchema),
  auditLog('FLASH_SALE_CREATE', 'CatalogItem'),
  asyncHandler(CatalogController.createFlashSale)
);

export { router as catalogRoutes };
