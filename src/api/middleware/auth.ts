import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../../utils/errors';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import { logAuthFailure } from './auditLog';
import { AuthenticatedRequest } from './rbac';

/**
 * Authentication middleware with user management
 * Validates API keys against database users
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey =
      req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!apiKey) {
      await logAuthFailure(
        req.ip || 'unknown',
        req.get('user-agent'),
        'No API key provided'
      );
      throw new UnauthorizedError('API key is required');
    }

    // Look up user by API key in database
    const user = await prisma.user.findUnique({
      where: { apiKey: apiKey as string },
      select: {
        id: true,
        username: true,
        role: true,
        apiKey: true,
        isActive: true,
      },
    });

    if (!user) {
      await logAuthFailure(
        req.ip || 'unknown',
        req.get('user-agent'),
        'Invalid API key'
      );
      throw new UnauthorizedError('Invalid API key');
    }

    if (!user.isActive) {
      await logAuthFailure(
        req.ip || 'unknown',
        req.get('user-agent'),
        `User ${user.username} is inactive`
      );
      throw new UnauthorizedError('User account is inactive');
    }

    // Attach user to request
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      apiKey: user.apiKey,
    };

    // Note: loginCount/lastLogin updates removed to reduce DB load
    // These were being called on every single API request, causing excessive writes

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: error.message,
      });
    }

    log.error('Authentication error', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional authentication - doesn't block if no key provided
 * Useful for endpoints that work differently for authenticated vs anonymous users
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const apiKey =
    req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    // No API key provided, continue as anonymous
    return next();
  }

  // Try to authenticate, but don't fail if it doesn't work
  try {
    await authenticate(req, res, next);
  } catch (error) {
    // Continue without authentication
    next();
  }
};

/**
 * Admin-only authentication (requires ADMIN_API_KEY or SUPER_ADMIN role)
 */
export const authenticateAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  await authenticate(req, res, () => {
    if (!req.user || (req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'ADMIN')) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Admin access required',
      });
    }
    next();
  });
};
