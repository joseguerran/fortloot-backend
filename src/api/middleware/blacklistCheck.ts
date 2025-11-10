import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';

/**
 * Middleware to check if a customer is blacklisted
 * Expects epicAccountId in request body or query
 */
export async function checkBlacklist(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const epicAccountId =
      req.body.epicAccountId ||
      req.query.epicAccountId ||
      req.body.customerEpicId ||
      req.query.customerEpicId;

    if (!epicAccountId) {
      // If no epicAccountId provided, skip blacklist check
      return next();
    }

    // Check if customer is blacklisted
    const blacklistEntry = await prisma.blacklist.findUnique({
      where: { epicAccountId: epicAccountId as string },
    });

    if (blacklistEntry) {
      log.warn(
        `Blacklisted customer attempted action: ${epicAccountId}`,
        {
          reason: blacklistEntry.reason,
          ip: req.ip,
          endpoint: req.path,
        }
      );

      return res.status(403).json({
        success: false,
        error: 'CUSTOMER_BLACKLISTED',
        message:
          'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
      });
    }

    // Check if customer exists and is marked as blacklisted
    const customer = await prisma.customer.findUnique({
      where: { epicAccountId: epicAccountId as string },
      select: {
        isBlacklisted: true,
        blacklistReason: true,
      },
    });

    if (customer && customer.isBlacklisted) {
      log.warn(
        `Blacklisted customer attempted action: ${epicAccountId}`,
        {
          reason: customer.blacklistReason,
          ip: req.ip,
          endpoint: req.path,
        }
      );

      return res.status(403).json({
        success: false,
        error: 'CUSTOMER_BLACKLISTED',
        message:
          'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
      });
    }

    // Not blacklisted, continue
    next();
  } catch (error) {
    log.error('Error checking blacklist:', error);
    // Don't block request on error, just log and continue
    next();
  }
}

/**
 * Middleware factory to check blacklist for a specific parameter name
 */
export function checkBlacklistForParam(paramName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const epicAccountId = req.params[paramName];

      if (!epicAccountId) {
        return next();
      }

      // Check if customer is blacklisted
      const blacklistEntry = await prisma.blacklist.findUnique({
        where: { epicAccountId },
      });

      if (blacklistEntry) {
        log.warn(`Blacklisted customer attempted action: ${epicAccountId}`, {
          reason: blacklistEntry.reason,
          ip: req.ip,
          endpoint: req.path,
        });

        return res.status(403).json({
          success: false,
          error: 'CUSTOMER_BLACKLISTED',
          message:
            'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
        });
      }

      // Check customer record
      const customer = await prisma.customer.findUnique({
        where: { epicAccountId },
        select: {
          isBlacklisted: true,
          blacklistReason: true,
        },
      });

      if (customer && customer.isBlacklisted) {
        log.warn(`Blacklisted customer attempted action: ${epicAccountId}`, {
          reason: customer.blacklistReason,
          ip: req.ip,
          endpoint: req.path,
        });

        return res.status(403).json({
          success: false,
          error: 'CUSTOMER_BLACKLISTED',
          message:
            'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
        });
      }

      next();
    } catch (error) {
      log.error('Error checking blacklist:', error);
      next();
    }
  };
}
