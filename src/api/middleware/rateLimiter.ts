/**
 * Rate Limiter - DISABLED
 *
 * Rate limiting is disabled because this API is only used internally
 * by the store and backoffice applications.
 *
 * All rate limiters export no-op middleware that allows all requests through.
 */

import { Request, Response, NextFunction } from 'express';

// No-op middleware that allows all requests
const noOpMiddleware = (req: Request, res: Response, next: NextFunction) => next();

export const apiRateLimiter = noOpMiddleware;
export const authRateLimiter = noOpMiddleware;
export const botOperationRateLimiter = noOpMiddleware;
export const botCreationRateLimiter = noOpMiddleware;
export const credentialsUpdateRateLimiter = noOpMiddleware;
export const orderCreationRateLimiter = noOpMiddleware;
export const analyticsRateLimiter = noOpMiddleware;
export const publicRateLimiter = noOpMiddleware;
export const epicAccountRateLimiter = noOpMiddleware;
export const uploadRateLimiter = noOpMiddleware;
export const orderPerEpicIdRateLimiter = noOpMiddleware;
export const webhookRateLimiter = noOpMiddleware;

export function roleBasedRateLimiter(limits: any) {
  return noOpMiddleware;
}

export function customRateLimiter(windowMs: number, max: number, message: string) {
  return noOpMiddleware;
}

export async function closeRateLimiter(): Promise<void> {
  // No-op
}

export default {
  apiRateLimiter,
  authRateLimiter,
  botOperationRateLimiter,
  botCreationRateLimiter,
  credentialsUpdateRateLimiter,
  orderCreationRateLimiter,
  analyticsRateLimiter,
  publicRateLimiter,
  epicAccountRateLimiter,
  uploadRateLimiter,
  orderPerEpicIdRateLimiter,
  webhookRateLimiter,
  roleBasedRateLimiter,
  customRateLimiter,
  closeRateLimiter,
};
