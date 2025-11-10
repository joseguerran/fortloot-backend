import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/client';
import { AuditAction } from '@prisma/client';
import { log } from '../../utils/logger';
import { AuthenticatedRequest } from './rbac';

/**
 * Audit log utility to track all system operations
 */

/**
 * Create an audit log entry
 */
export async function createAuditLog(params: {
  userId?: string;
  username: string;
  ipAddress: string;
  userAgent?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  description: string;
  changes?: any;
  metadata?: any;
  success?: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        username: params.username,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        description: params.description,
        changes: params.changes || null,
        metadata: params.metadata || null,
        success: params.success !== undefined ? params.success : true,
        errorMessage: params.errorMessage,
      },
    });

    log.info('Audit log created', {
      action: params.action,
      username: params.username,
      resource: params.resource,
      success: params.success !== false,
    });
  } catch (error) {
    // Don't fail the request if audit logging fails
    log.error('Failed to create audit log', error);
  }
}

/**
 * Middleware to automatically audit specific operations
 */
export function auditLog(action: AuditAction, resource: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    const originalSend = res.json.bind(res);

    // Override res.json to capture the response
    res.json = function (body: any): Response {
      // Log after response is ready
      setImmediate(async () => {
        const success = res.statusCode < 400 && body.success !== false;

        await createAuditLog({
          userId: user?.id,
          username: user?.username || 'anonymous',
          ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
          userAgent: req.get('user-agent'),
          action,
          resource,
          resourceId: req.params.botId || req.params.orderId || req.params.userId,
          description: `${req.method} ${req.path}`,
          changes: {
            method: req.method,
            path: req.path,
            body: req.body,
            query: req.query,
            params: req.params,
          },
          metadata: {
            statusCode: res.statusCode,
            responsePreview: body?.message || body?.error,
          },
          success,
          errorMessage: success ? undefined : (body?.message || body?.error),
        });
      });

      return originalSend(body);
    };

    next();
  };
}

/**
 * Middleware to log authentication failures
 */
export async function logAuthFailure(
  ipAddress: string,
  userAgent: string | undefined,
  reason: string
): Promise<void> {
  await createAuditLog({
    username: 'anonymous',
    ipAddress,
    userAgent,
    action: 'AUTH_FAILED',
    resource: 'Auth',
    description: `Authentication failed: ${reason}`,
    success: false,
    errorMessage: reason,
  });
}

/**
 * Middleware to log permission denials
 */
export async function logPermissionDenied(
  req: AuthenticatedRequest,
  requiredRole: string
): Promise<void> {
  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.username || 'anonymous',
    ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.get('user-agent'),
    action: 'PERMISSION_DENIED',
    resource: 'Authorization',
    description: `Permission denied for ${req.method} ${req.path}`,
    metadata: {
      requiredRole,
      userRole: req.user?.role,
      path: req.path,
      method: req.method,
    },
    success: false,
    errorMessage: `User lacks required role: ${requiredRole}`,
  });
}

/**
 * Middleware to log rate limit exceeded
 */
export async function logRateLimitExceeded(
  req: AuthenticatedRequest,
  limit: number
): Promise<void> {
  await createAuditLog({
    userId: req.user?.id,
    username: req.user?.username || 'anonymous',
    ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.get('user-agent'),
    action: 'RATE_LIMIT_EXCEEDED',
    resource: 'RateLimit',
    description: `Rate limit exceeded for ${req.path}`,
    metadata: {
      path: req.path,
      method: req.method,
      limit,
    },
    success: false,
    errorMessage: `Rate limit of ${limit} requests exceeded`,
  });
}

/**
 * Manual audit logging for specific operations
 */
export const audit = {
  botCreate: (userId: string, username: string, botId: string, botName: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'BOT_CREATE',
      resource: 'Bot',
      resourceId: botId,
      description: `Created bot: ${botName}`,
    }),

  botUpdate: (
    userId: string,
    username: string,
    botId: string,
    changes: any,
    ip: string
  ) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'BOT_UPDATE',
      resource: 'Bot',
      resourceId: botId,
      description: `Updated bot configuration`,
      changes,
    }),

  botDelete: (userId: string, username: string, botId: string, botName: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'BOT_DELETE',
      resource: 'Bot',
      resourceId: botId,
      description: `Deleted bot: ${botName}`,
    }),

  botLogin: (userId: string, username: string, botId: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'BOT_LOGIN',
      resource: 'Bot',
      resourceId: botId,
      description: `Logged in bot`,
    }),

  botLogout: (userId: string, username: string, botId: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'BOT_LOGOUT',
      resource: 'Bot',
      resourceId: botId,
      description: `Logged out bot`,
    }),

  botRestart: (userId: string, username: string, botId: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'BOT_RESTART',
      resource: 'Bot',
      resourceId: botId,
      description: `Restarted bot`,
    }),

  botCredentialsUpdate: (userId: string, username: string, botId: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'BOT_CREDENTIALS_UPDATE',
      resource: 'Bot',
      resourceId: botId,
      description: `Updated bot credentials`,
    }),

  userLogin: (userId: string, username: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'USER_LOGIN',
      resource: 'User',
      resourceId: userId,
      description: `User logged in`,
    }),

  userLogout: (userId: string, username: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'USER_LOGOUT',
      resource: 'User',
      resourceId: userId,
      description: `User logged out`,
    }),

  configUpdate: (userId: string, username: string, key: string, ip: string) =>
    createAuditLog({
      userId,
      username,
      ipAddress: ip,
      action: 'CONFIG_UPDATE',
      resource: 'Config',
      resourceId: key,
      description: `Updated system configuration: ${key}`,
    }),
};

export default {
  createAuditLog,
  auditLog,
  logAuthFailure,
  logPermissionDenied,
  logRateLimitExceeded,
  audit,
};
