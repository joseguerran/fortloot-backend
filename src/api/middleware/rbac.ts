import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { log } from '../../utils/logger';

/**
 * Role hierarchy for permission checking
 * Higher roles inherit permissions from lower roles
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  OPERATOR: 2,
  VIEWER: 1,
};

/**
 * Extended Request interface with user information
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: UserRole;
    apiKey: string;
  };
}

/**
 * Check if user has required role or higher
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Middleware to require specific role
 * Usage: router.post('/endpoint', requireRole('ADMIN'), handler)
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      log.warn('RBAC: No user found in request', {
        path: req.path,
        method: req.method,
      });

      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }

    // Check if user has any of the allowed roles
    const hasPermission = allowedRoles.some((requiredRole) =>
      hasRole(user.role, requiredRole)
    );

    if (!hasPermission) {
      log.warn('RBAC: Permission denied', {
        userId: user.id,
        username: user.username,
        userRole: user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
      });

      return res.status(403).json({
        success: false,
        error: 'PERMISSION_DENIED',
        message: 'You do not have permission to access this resource',
        requiredRole: allowedRoles,
        yourRole: user.role,
      });
    }

    // User has permission
    next();
  };
}

/**
 * Middleware to require admin role (ADMIN or SUPER_ADMIN)
 */
export const requireAdmin = requireRole('ADMIN');

/**
 * Middleware to require operator role or higher
 */
export const requireOperator = requireRole('OPERATOR');

/**
 * Middleware to check if user is super admin
 */
export const requireSuperAdmin = requireRole('SUPER_ADMIN');

/**
 * Middleware to allow any authenticated user (all roles)
 */
export const requireAuth = requireRole('VIEWER');

/**
 * Check if user can perform sensitive operations (view/edit credentials)
 */
export function canAccessCredentials(userRole: UserRole): boolean {
  return hasRole(userRole, 'ADMIN');
}

/**
 * Check if user can manage other users
 */
export function canManageUsers(userRole: UserRole): boolean {
  return hasRole(userRole, 'ADMIN');
}

/**
 * Check if user can manage bot operations (start/stop/restart)
 */
export function canManageBots(userRole: UserRole): boolean {
  return hasRole(userRole, 'OPERATOR');
}

/**
 * Permission definitions for different operations
 */
export const PERMISSIONS = {
  // Bot operations
  BOT_VIEW: ['VIEWER'] as UserRole[],
  BOT_CREATE: ['ADMIN'] as UserRole[],
  BOT_UPDATE: ['ADMIN'] as UserRole[],
  BOT_DELETE: ['ADMIN'] as UserRole[],
  BOT_CREDENTIALS_VIEW: ['ADMIN'] as UserRole[],
  BOT_CREDENTIALS_UPDATE: ['ADMIN'] as UserRole[],
  BOT_CONTROL: ['OPERATOR'] as UserRole[], // start/stop/restart

  // Order operations
  ORDER_VIEW: ['VIEWER'] as UserRole[],
  ORDER_CREATE: ['OPERATOR'] as UserRole[],
  ORDER_UPDATE: ['OPERATOR'] as UserRole[],
  ORDER_CANCEL: ['OPERATOR'] as UserRole[],

  // User management
  USER_VIEW: ['ADMIN'] as UserRole[],
  USER_CREATE: ['ADMIN'] as UserRole[],
  USER_UPDATE: ['ADMIN'] as UserRole[],
  USER_DELETE: ['SUPER_ADMIN'] as UserRole[],

  // System operations
  CONFIG_VIEW: ['ADMIN'] as UserRole[],
  CONFIG_UPDATE: ['SUPER_ADMIN'] as UserRole[],

  // Analytics
  ANALYTICS_VIEW: ['VIEWER'] as UserRole[],
  ANALYTICS_EXPORT: ['OPERATOR'] as UserRole[],
};

/**
 * Helper to check specific permission
 */
export function hasPermission(
  userRole: UserRole,
  permission: keyof typeof PERMISSIONS
): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return allowedRoles.some((role) => hasRole(userRole, role));
}

/**
 * Middleware factory for specific permissions
 */
export function requirePermission(permission: keyof typeof PERMISSIONS) {
  return requireRole(...PERMISSIONS[permission]);
}

export default {
  requireRole,
  requireAdmin,
  requireOperator,
  requireSuperAdmin,
  requireAuth,
  hasRole,
  canAccessCredentials,
  canManageUsers,
  canManageBots,
  hasPermission,
  requirePermission,
  PERMISSIONS,
};
