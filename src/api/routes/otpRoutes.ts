import { Router } from 'express';
import { OTPController } from '../controllers/OTPController';
import { asyncHandler } from '../middleware/errorHandler';
import { publicRateLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import {
  requestOTPSchema,
  verifyOTPSchema,
  getCustomerOrdersSchema,
} from '../../validation/schemas';

const router = Router();

// Public routes (no auth required, pero con rate limiting estricto)

/**
 * POST /api/otp/request
 * Solicita un código OTP
 */
router.post(
  '/request',
  publicRateLimiter,
  validate(requestOTPSchema),
  asyncHandler(OTPController.requestOTP)
);

/**
 * POST /api/otp/verify
 * Verifica un código OTP
 */
router.post(
  '/verify',
  publicRateLimiter,
  validate(verifyOTPSchema),
  asyncHandler(OTPController.verifyOTP)
);

/**
 * POST /api/otp/request-by-epic
 * Solicita un código OTP usando Epic ID
 */
router.post(
  '/request-by-epic',
  publicRateLimiter,
  asyncHandler(OTPController.requestOTPByEpicId)
);

/**
 * POST /api/otp/verify-by-epic
 * Verifica un código OTP usando Epic ID
 */
router.post(
  '/verify-by-epic',
  publicRateLimiter,
  asyncHandler(OTPController.verifyOTPByEpicId)
);

/**
 * GET /api/otp/orders/:customerId
 * Obtiene las órdenes de un cliente verificado
 */
router.get(
  '/orders/:customerId',
  publicRateLimiter,
  validate(getCustomerOrdersSchema),
  asyncHandler(OTPController.getCustomerOrders)
);

export { router as otpRoutes };
