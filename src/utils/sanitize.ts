import { Bot } from '@prisma/client';
import { maskValue } from './encryption';

/**
 * Sanitization utilities to prevent exposing sensitive data in API responses
 */

// Fields that should never be exposed in API responses
const SENSITIVE_FIELDS = ['deviceId', 'accountId', 'secret'];

// Fields to mask (show partially)
const MASK_FIELDS = ['epicAccountId'];

/**
 * Sanitize bot data for API response
 * Removes or masks sensitive fields
 */
export function sanitizeBotData(
  bot: Bot,
  options: {
    showCredentials?: boolean; // Only for admin endpoints
    maskSensitive?: boolean; // Mask instead of removing
  } = {}
): Partial<Bot> & { credentials?: string } {
  const { showCredentials = false, maskSensitive = true } = options;

  // Create a copy to avoid mutating original
  const sanitized: any = { ...bot };

  if (!showCredentials) {
    // Remove sensitive fields
    SENSITIVE_FIELDS.forEach((field) => {
      if (maskSensitive && sanitized[field]) {
        sanitized[field] = '***';
      } else {
        delete sanitized[field];
      }
    });

    // Mask partially visible fields
    MASK_FIELDS.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = maskValue(sanitized[field]);
      }
    });
  } else {
    // For admin endpoints, indicate that credentials are available
    sanitized.credentials = 'available';
  }

  return sanitized;
}

/**
 * Sanitize an array of bots
 */
export function sanitizeBotArray(
  bots: Bot[],
  options: {
    showCredentials?: boolean;
    maskSensitive?: boolean;
  } = {}
): Array<Partial<Bot>> {
  return bots.map((bot) => sanitizeBotData(bot, options));
}

/**
 * Sanitize bot data but keep credential fields for admin view
 * Masks them instead of removing
 */
export function sanitizeBotDataForAdmin(bot: Bot): Partial<Bot> {
  const sanitized: any = { ...bot };

  // Mask sensitive fields for security
  SENSITIVE_FIELDS.forEach((field) => {
    if (sanitized[field]) {
      sanitized[field] = maskValue(sanitized[field], 6);
    }
  });

  return sanitized;
}

/**
 * Get only credentials from bot (for admin use)
 */
export function extractBotCredentials(bot: Bot): {
  deviceId: string;
  accountId: string;
  secret: string;
  epicAccountId: string;
} {
  return {
    deviceId: bot.deviceId,
    accountId: bot.accountId,
    secret: bot.secret,
    epicAccountId: bot.epicAccountId,
  };
}

/**
 * Sanitize audit log entry
 * Removes sensitive data from changes field
 */
export function sanitizeAuditLog(log: any): any {
  const sanitized = { ...log };

  if (sanitized.changes && typeof sanitized.changes === 'object') {
    const changes = { ...sanitized.changes };

    // Remove sensitive fields from changes
    SENSITIVE_FIELDS.forEach((field) => {
      if (changes[field]) {
        changes[field] = '***';
      }
    });

    sanitized.changes = changes;
  }

  return sanitized;
}

/**
 * Check if user has permission to view credentials
 */
export function canViewCredentials(userRole: string): boolean {
  return ['ADMIN', 'SUPER_ADMIN'].includes(userRole);
}

/**
 * Sanitize error messages to avoid leaking sensitive info
 */
export function sanitizeError(error: Error): { message: string; code?: string } {
  let message = error.message;

  // Remove file paths from error messages
  message = message.replace(/\/[^\s]+/g, '[PATH]');

  // Remove potential API keys or tokens
  message = message.replace(/[a-f0-9]{32,}/gi, '[REDACTED]');

  // Remove potential Epic account IDs
  message = message.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '[ACCOUNT_ID]');

  return {
    message,
    code: (error as any).code,
  };
}

export default {
  sanitizeBotData,
  sanitizeBotArray,
  sanitizeBotDataForAdmin,
  extractBotCredentials,
  sanitizeAuditLog,
  canViewCredentials,
  sanitizeError,
};
