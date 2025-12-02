import { Router } from 'express';
import { OrderController } from '../controllers/OrderController';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { orderPerEpicIdRateLimiter } from '../middleware/rateLimiter';
import {
  createOrderSchema,
  getOrderStatusSchema,
  getOrdersSchema,
  cancelOrderSchema,
} from '../../validation/schemas';

const router = Router();

// Public route: Get order by orderNumber (for email links)
router.get('/number/:orderNumber', asyncHandler(OrderController.getOrderByNumber));

// All other routes require authentication
router.use(authenticate);

// Create new order
router.post('/', orderPerEpicIdRateLimiter, validate(createOrderSchema), asyncHandler(OrderController.createOrder));

// Get order status
router.get('/:orderId', validate(getOrderStatusSchema), asyncHandler(OrderController.getOrderStatus));

// Get all orders (with pagination)
router.get('/', validate(getOrdersSchema), asyncHandler(OrderController.getOrders));

// Cancel order
router.post('/:orderId/cancel', validate(cancelOrderSchema), asyncHandler(OrderController.cancelOrder));

// Approve order (verify payment)
router.post('/:orderId/approve', validate(cancelOrderSchema), asyncHandler(OrderController.approveOrder));

// Retry failed order
router.post('/:orderId/retry', validate(cancelOrderSchema), asyncHandler(OrderController.retryOrder));

// Manual intervention: Mark V-Bucks as loaded
router.post('/:orderId/vbucks-loaded', validate(cancelOrderSchema), asyncHandler(OrderController.markVBucksLoaded));

// Manual intervention: Mark bot as fixed
router.post('/:orderId/bot-fixed', validate(cancelOrderSchema), asyncHandler(OrderController.markBotFixed));

// Manual intervention: Continue/re-push stuck order
router.post('/:orderId/continue', validate(cancelOrderSchema), asyncHandler(OrderController.continueOrder));

export { router as orderRoutes };
