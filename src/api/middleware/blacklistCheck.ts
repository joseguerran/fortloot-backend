import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';

/**
 * Middleware to check if a customer is blacklisted
 * Checks by displayName (primary) or customerId
 */
export async function checkBlacklist(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Get customer identifier from request
    const customerId = req.body.customerId || req.query.customerId;
    const displayName = req.body.displayName || req.query.displayName;

    if (!customerId && !displayName) {
      // If no identifier provided, skip blacklist check
      return next();
    }

    // If we have customerId, get the customer and check
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId as string },
        select: {
          displayName: true,
          epicAccountId: true,
          isBlacklisted: true,
          blacklistReason: true,
        },
      });

      if (customer) {
        // Check if customer is marked as blacklisted
        if (customer.isBlacklisted) {
          log.warn(`Blacklisted customer attempted action: ${customer.displayName}`, {
            reason: customer.blacklistReason,
            ip: req.ip,
            endpoint: req.path,
          });

          return res.status(403).json({
            success: false,
            error: 'CUSTOMER_BLACKLISTED',
            message: 'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
          });
        }

        // Check blacklist table by displayName
        const blacklistEntry = await prisma.blacklist.findUnique({
          where: { displayName: customer.displayName },
        });

        if (blacklistEntry) {
          log.warn(`Blacklisted customer attempted action: ${customer.displayName}`, {
            reason: blacklistEntry.reason,
            ip: req.ip,
            endpoint: req.path,
          });

          return res.status(403).json({
            success: false,
            error: 'CUSTOMER_BLACKLISTED',
            message: 'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
          });
        }
      }
    }

    // If we have displayName directly, check blacklist
    if (displayName) {
      const blacklistEntry = await prisma.blacklist.findUnique({
        where: { displayName: displayName as string },
      });

      if (blacklistEntry) {
        log.warn(`Blacklisted displayName attempted action: ${displayName}`, {
          reason: blacklistEntry.reason,
          ip: req.ip,
          endpoint: req.path,
        });

        return res.status(403).json({
          success: false,
          error: 'CUSTOMER_BLACKLISTED',
          message: 'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
        });
      }

      // Also check customer record by displayName
      const customer = await prisma.customer.findUnique({
        where: { displayName: displayName as string },
        select: {
          isBlacklisted: true,
          blacklistReason: true,
        },
      });

      if (customer && customer.isBlacklisted) {
        log.warn(`Blacklisted customer attempted action: ${displayName}`, {
          reason: customer.blacklistReason,
          ip: req.ip,
          endpoint: req.path,
        });

        return res.status(403).json({
          success: false,
          error: 'CUSTOMER_BLACKLISTED',
          message: 'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
        });
      }
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
      const identifier = req.params[paramName];

      if (!identifier) {
        return next();
      }

      // Check blacklist by displayName
      const blacklistEntry = await prisma.blacklist.findUnique({
        where: { displayName: identifier },
      });

      if (blacklistEntry) {
        log.warn(`Blacklisted customer attempted action: ${identifier}`, {
          reason: blacklistEntry.reason,
          ip: req.ip,
          endpoint: req.path,
        });

        return res.status(403).json({
          success: false,
          error: 'CUSTOMER_BLACKLISTED',
          message: 'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
        });
      }

      // Check customer record by displayName
      const customer = await prisma.customer.findUnique({
        where: { displayName: identifier },
        select: {
          isBlacklisted: true,
          blacklistReason: true,
        },
      });

      if (customer && customer.isBlacklisted) {
        log.warn(`Blacklisted customer attempted action: ${identifier}`, {
          reason: customer.blacklistReason,
          ip: req.ip,
          endpoint: req.path,
        });

        return res.status(403).json({
          success: false,
          error: 'CUSTOMER_BLACKLISTED',
          message: 'Tu cuenta ha sido bloqueada. Por favor contacta a soporte para más información.',
        });
      }

      next();
    } catch (error) {
      log.error('Error checking blacklist:', error);
      next();
    }
  };
}
