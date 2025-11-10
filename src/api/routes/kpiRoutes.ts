import { Router } from 'express';
import { KPIController } from '../controllers/KPIController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import {
  getKPIsSchema,
  getTopCustomersSchema,
  getTopProductsSchema,
  getDailyTrendSchema,
} from '../../validation/schemas';

const router = Router();

// All KPI routes require authentication
router.use(authenticate);
router.use(apiRateLimiter);

// Get revenue KPIs (viewer can see)
router.get(
  '/revenue',
  requireRole('VIEWER'),
  validate(getKPIsSchema),
  asyncHandler(KPIController.getRevenueKPIs)
);

// Get product KPIs (viewer can see)
router.get(
  '/products',
  requireRole('VIEWER'),
  validate(getKPIsSchema),
  asyncHandler(KPIController.getProductKPIs)
);

// Get customer KPIs (viewer can see)
router.get(
  '/customers',
  requireRole('VIEWER'),
  validate(getKPIsSchema),
  asyncHandler(KPIController.getCustomerKPIs)
);

// Get tier KPIs (viewer can see)
router.get(
  '/tiers',
  requireRole('VIEWER'),
  validate(getKPIsSchema),
  asyncHandler(KPIController.getTierKPIs)
);

// Get top products (viewer can see)
router.get(
  '/top-products',
  requireRole('VIEWER'),
  validate(getTopProductsSchema),
  asyncHandler(KPIController.getTopProducts)
);

// Get top customers (viewer can see)
router.get(
  '/top-customers',
  requireRole('VIEWER'),
  validate(getTopCustomersSchema),
  asyncHandler(KPIController.getTopCustomers)
);

// Get daily revenue trend (viewer can see)
router.get(
  '/daily-trend',
  requireRole('VIEWER'),
  validate(getDailyTrendSchema),
  asyncHandler(KPIController.getDailyRevenueTrend)
);

export { router as kpiRoutes };
