import { Router } from 'express';
import { ExchangeRateController } from '../controllers/ExchangeRateController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { apiRateLimiter } from '../middleware/rateLimiter';
import { auditLog } from '../middleware/auditLog';

const router = Router();

// Protected routes (require authentication)
router.use(authenticate);
router.use(apiRateLimiter);

// ============================================================================
// Public Routes (for store/checkout)
// ============================================================================

// Get current exchange rate for a currency
router.get(
  '/:currency',
  asyncHandler(ExchangeRateController.getRate)
);

// ============================================================================
// Admin Routes
// ============================================================================
router.use(requireAdmin);

// List all cached exchange rates
router.get(
  '/',
  asyncHandler(ExchangeRateController.listRates)
);

// Get detailed rate info (including manual override status)
router.get(
  '/:currency/info',
  asyncHandler(ExchangeRateController.getRateInfo)
);

// Force refresh rate from provider
router.post(
  '/:currency/fetch',
  auditLog('EXCHANGE_RATE_FETCH', 'ExchangeRateCache'),
  asyncHandler(ExchangeRateController.fetchRate)
);

// Test Binance P2P connection
router.post(
  '/:currency/test',
  asyncHandler(ExchangeRateController.testConnection)
);

// Invalidate cache
router.delete(
  '/:currency/cache',
  auditLog('EXCHANGE_RATE_CACHE_INVALIDATE', 'ExchangeRateCache'),
  asyncHandler(ExchangeRateController.invalidateCache)
);

// Set manual rate override
router.put(
  '/:currency/manual',
  auditLog('EXCHANGE_RATE_MANUAL_SET', 'ExchangeRateCache'),
  asyncHandler(ExchangeRateController.setManualRate)
);

// Clear manual rate override
router.delete(
  '/:currency/manual',
  auditLog('EXCHANGE_RATE_MANUAL_CLEAR', 'ExchangeRateCache'),
  asyncHandler(ExchangeRateController.clearManualRate)
);

export { router as exchangeRateRoutes };
