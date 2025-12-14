import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';
import path from 'path';
import fs from 'fs';

// Ensure log directory exists
if (!fs.existsSync(config.logging.dir)) {
  fs.mkdirSync(config.logging.dir, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════
// ERROR DEDUPLICATOR - Prevents spam of repeated errors
// ═══════════════════════════════════════════════════════════════

interface ErrorEntry {
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  message: string;
}

class ErrorDeduplicator {
  private errorCounts = new Map<string, ErrorEntry>();
  private readonly windowMs: number;

  constructor(windowMinutes: number = 5) {
    this.windowMs = windowMinutes * 60 * 1000;
    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Generate a unique key for error deduplication
   */
  private generateKey(level: string, code: string | undefined, message: string): string {
    const normalizedMsg = message.substring(0, 100); // Truncate for key
    return `${level}:${code || 'unknown'}:${normalizedMsg}`;
  }

  /**
   * Check if this error should be logged
   * Returns: { shouldLog: boolean, summary?: string }
   */
  shouldLog(
    level: string,
    message: string,
    meta?: Record<string, unknown>
  ): { shouldLog: boolean; summary?: string; count?: number } {
    // Only deduplicate errors and warnings
    if (level !== 'error' && level !== 'warn') {
      return { shouldLog: true };
    }

    const code = meta?.code as string | undefined;
    const key = this.generateKey(level, code, message);
    const now = new Date();
    const existing = this.errorCounts.get(key);

    if (!existing) {
      // First occurrence
      this.errorCounts.set(key, {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        message,
      });
      return { shouldLog: true };
    }

    // Check if window has passed
    const windowPassed = now.getTime() - existing.firstSeen.getTime() > this.windowMs;

    if (windowPassed) {
      // Window passed, log summary and reset
      const count = existing.count;
      this.errorCounts.set(key, {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        message,
      });

      if (count > 1) {
        return {
          shouldLog: true,
          summary: `(repeated ${count} times in last ${Math.round(this.windowMs / 60000)} min)`,
          count,
        };
      }
      return { shouldLog: true };
    }

    // Within window, increment and suppress
    existing.count++;
    existing.lastSeen = now;

    // Log every 10th occurrence as a reminder
    if (existing.count === 10) {
      return {
        shouldLog: true,
        summary: `(10+ occurrences, suppressing for ${Math.round(this.windowMs / 60000)} min)`,
      };
    }

    return { shouldLog: false };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.errorCounts.entries()) {
      if (now - entry.lastSeen.getTime() > this.windowMs * 2) {
        this.errorCounts.delete(key);
      }
    }
  }
}

const errorDeduplicator = new ErrorDeduplicator(config.logging.dedupeWindowMin || 5);

// ═══════════════════════════════════════════════════════════════
// READABLE FORMAT - Human-friendly log output
// ═══════════════════════════════════════════════════════════════

/**
 * Format metadata fields as indented lines
 */
function formatMeta(meta: Record<string, unknown>, excludeKeys: string[] = []): string {
  const importantKeys = ['code', 'httpStatus', 'statusCode', 'error', 'reason', 'customer', 'item', 'epicId'];
  const exclude = new Set([...excludeKeys, 'timestamp', 'level', 'message', 'botName', 'orderNumber', 'service']);

  const entries = Object.entries(meta)
    .filter(([k, v]) => !exclude.has(k) && v !== undefined && v !== null)
    .sort((a, b) => {
      const aImportant = importantKeys.indexOf(a[0]);
      const bImportant = importantKeys.indexOf(b[0]);
      if (aImportant !== -1 && bImportant !== -1) return aImportant - bImportant;
      if (aImportant !== -1) return -1;
      if (bImportant !== -1) return 1;
      return 0;
    })
    .slice(0, 6); // Max 6 fields

  if (entries.length === 0) return '';

  return entries
    .map(([k, v]) => {
      const value = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `\n  -> ${k}: ${value}`;
    })
    .join('');
}

/**
 * Readable format for file logs
 */
const readableFileFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const botName = meta.botName as string | undefined;
  const orderNumber = meta.orderNumber as string | undefined;
  const service = meta.service as string | undefined;

  let prefix = `${timestamp} [${level.toUpperCase().padEnd(5)}]`;

  if (botName) {
    prefix += ` [BOT:${botName}]`;
  }
  if (orderNumber) {
    prefix += ` [ORDER:${orderNumber}]`;
  }
  if (service) {
    prefix += ` [${service.toUpperCase()}]`;
  }

  const metaStr = formatMeta(meta as Record<string, unknown>);
  return `${prefix} ${message}${metaStr}`;
});

/**
 * Console format with colors
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const botName = meta.botName as string | undefined;
    const orderNumber = meta.orderNumber as string | undefined;

    let prefix = `${timestamp} [${level}]`;
    if (botName) prefix += ` [BOT:${botName}]`;
    if (orderNumber) prefix += ` [ORDER:${orderNumber}]`;

    return `${prefix}: ${message}`;
  })
);

/**
 * Order timeline format - special visual format for order logs
 */
const orderTimelineFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const orderNumber = meta.orderNumber as string | undefined;
  const customer = meta.customer as string | undefined;
  const item = meta.item as string | undefined;
  const status = meta.status as string | undefined;
  const isHeader = meta.isHeader as boolean | undefined;
  const total = meta.total as string | undefined;

  // Header for new order
  if (isHeader) {
    const separator = '='.repeat(70);
    return `\n${separator}\nORDER: ${orderNumber} | Customer: ${customer || 'N/A'} | Item: ${item || 'N/A'}${total ? ` | Total: ${total}` : ''}\n${separator}`;
  }

  // Status line
  const time = typeof timestamp === 'string' ? timestamp.split(' ')[1] : '';
  const statusTag = status ? `[${status.toUpperCase().padEnd(12)}]` : '[INFO        ]';
  const metaStr = formatMeta(meta as Record<string, unknown>, ['status', 'isHeader', 'customer', 'item', 'total']);

  return `${time} ${statusTag} ${message}${metaStr}`;
});

// ═══════════════════════════════════════════════════════════════
// TRANSPORTS - Separate files for different log types
// ═══════════════════════════════════════════════════════════════

// Filter to exclude bot logs from application log
const excludeBotFilter = winston.format((info) => {
  if (info.botName || info.service === 'bot') return false;
  return info;
});

// Filter for bot-only logs
const botOnlyFilter = winston.format((info) => {
  if (info.botName || info.service === 'bot') return info;
  return false;
});

// Filter for order-only logs
const orderOnlyFilter = winston.format((info) => {
  if (info.orderNumber || info.service === 'order') return info;
  return false;
});

// Application logs - excludes bot logs
const applicationTransport = new DailyRotateFile({
  filename: path.join(config.logging.dir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: winston.format.combine(
    excludeBotFilter(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    readableFileFormat
  ),
});

// Error logs - all errors
const errorTransport = new DailyRotateFile({
  filename: path.join(config.logging.dir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    readableFileFormat
  ),
});

// Bot logs - only bot-related logs
const botTransport = new DailyRotateFile({
  filename: path.join(config.logging.dir, 'bot-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '7d',
  format: winston.format.combine(
    botOnlyFilter(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    readableFileFormat
  ),
});

// Order logs - timeline format
const orderTransport = new DailyRotateFile({
  filename: path.join(config.logging.dir, 'order-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  format: winston.format.combine(
    orderOnlyFilter(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    orderTimelineFormat
  ),
});

// ═══════════════════════════════════════════════════════════════
// MAIN LOGGER
// ═══════════════════════════════════════════════════════════════

const baseLogger = winston.createLogger({
  level: config.logging.level,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    applicationTransport,
    errorTransport,
    botTransport,
    orderTransport,
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'exceptions.log'),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(config.logging.dir, 'rejections.log'),
    }),
  ],
});

// ═══════════════════════════════════════════════════════════════
// LOGGING API
// ═══════════════════════════════════════════════════════════════

/**
 * Internal logging function with deduplication
 */
function logWithDedup(
  level: 'error' | 'warn' | 'info' | 'debug',
  message: string,
  meta?: Record<string, unknown>
): void {
  const { shouldLog, summary } = errorDeduplicator.shouldLog(level, message, meta);

  if (!shouldLog) return;

  const finalMessage = summary ? `${message} ${summary}` : message;
  baseLogger.log(level, finalMessage, meta || {});
}

// Bot name cache for quick lookups
const botNameCache = new Map<string, string>();

/**
 * Register a bot name for logging (call this when bot is loaded)
 */
export function registerBotName(botId: string, displayName: string): void {
  botNameCache.set(botId, displayName);
}

/**
 * Get bot name from cache or return shortened ID
 */
function getBotName(botId: string): string {
  return botNameCache.get(botId) || botId.substring(0, 8);
}

// Helper to convert unknown to record
function toRecord(meta: unknown): Record<string, unknown> {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  if (meta instanceof Error) {
    return { error: meta.message, stack: meta.stack };
  }
  return meta ? { value: meta } : {};
}

// Export structured logging API
export const log = {
  error: (message: string, meta?: unknown) => logWithDedup('error', message, toRecord(meta)),
  warn: (message: string, meta?: unknown) => logWithDedup('warn', message, toRecord(meta)),
  info: (message: string, meta?: unknown) => logWithDedup('info', message, toRecord(meta)),
  debug: (message: string, meta?: unknown) => logWithDedup('debug', message, toRecord(meta)),

  // Bot-specific logging - uses botName
  bot: {
    error: (botId: string, message: string, meta?: unknown) =>
      logWithDedup('error', message, { botName: getBotName(botId), service: 'bot', ...toRecord(meta) }),
    warn: (botId: string, message: string, meta?: unknown) =>
      logWithDedup('warn', message, { botName: getBotName(botId), service: 'bot', ...toRecord(meta) }),
    info: (botId: string, message: string, meta?: unknown) =>
      baseLogger.info(message, { botName: getBotName(botId), service: 'bot', ...toRecord(meta) }),
    debug: (botId: string, message: string, meta?: unknown) =>
      baseLogger.debug(message, { botName: getBotName(botId), service: 'bot', ...toRecord(meta) }),
  },

  // Order-specific logging with timeline format
  order: {
    /**
     * Log order creation - creates header in order.log
     */
    created: (orderNumber: string, meta: { customer?: string; item?: string; total?: string } & Record<string, unknown> = {}) => {
      // Log header line
      baseLogger.info('', {
        orderNumber,
        service: 'order',
        isHeader: true,
        customer: meta.customer,
        item: meta.item,
        total: meta.total,
      });
      // Log creation event
      baseLogger.info(`Orden creada - ${meta.total || 'N/A'}`, {
        orderNumber,
        service: 'order',
        status: 'CREATED',
        ...meta,
      });
    },

    /**
     * Log order status updates
     */
    updated: (orderNumber: string, status: string, message: string, meta?: unknown) =>
      baseLogger.info(message, { orderNumber, service: 'order', status, ...toRecord(meta) }),

    /**
     * Log payment received
     */
    payment: (orderNumber: string, method: string, meta?: unknown) =>
      baseLogger.info(`Pago recibido via ${method}`, { orderNumber, service: 'order', status: 'PAYMENT', ...toRecord(meta) }),

    /**
     * Log bot assignment
     */
    assigned: (orderNumber: string, botId: string, meta?: unknown) =>
      baseLogger.info(`Bot asignado: ${getBotName(botId)}`, { orderNumber, service: 'order', status: 'ASSIGNED', botName: getBotName(botId), ...toRecord(meta) }),

    /**
     * Log friendship events
     */
    friendship: (orderNumber: string, message: string, meta?: unknown) =>
      baseLogger.info(message, { orderNumber, service: 'order', status: 'FRIENDSHIP', ...toRecord(meta) }),

    /**
     * Log queued for gifting
     */
    queued: (orderNumber: string, meta?: unknown) =>
      baseLogger.info('Agregada a cola de regalos', { orderNumber, service: 'order', status: 'QUEUED', ...toRecord(meta) }),

    /**
     * Log gifting in progress
     */
    gifting: (orderNumber: string, meta?: unknown) =>
      baseLogger.info('Enviando regalo...', { orderNumber, service: 'order', status: 'GIFTING', ...toRecord(meta) }),

    /**
     * Log order completed successfully
     */
    completed: (orderNumber: string, meta?: unknown) =>
      baseLogger.info('Regalo enviado exitosamente', { orderNumber, service: 'order', status: 'COMPLETED', ...toRecord(meta) }),

    /**
     * Log order errors
     */
    error: (orderNumber: string, message: string, meta?: unknown) =>
      logWithDedup('error', message, { orderNumber, service: 'order', status: 'ERROR', ...toRecord(meta) }),

    /**
     * Log order reassignment
     */
    reassigned: (orderNumber: string, newBotId: string, meta?: unknown) =>
      baseLogger.info(`Reasignado a: ${getBotName(newBotId)}`, { orderNumber, service: 'order', status: 'REASSIGNED', botName: getBotName(newBotId), ...toRecord(meta) }),
  },

  // Gift-specific logging
  gift: {
    queued: (giftId: string, meta?: unknown) =>
      baseLogger.info('Gift queued', { giftId, ...toRecord(meta) }),
    sending: (giftId: string, meta?: unknown) =>
      baseLogger.info('Gift sending', { giftId, ...toRecord(meta) }),
    sent: (giftId: string, meta?: unknown) =>
      baseLogger.info('Gift sent successfully', { giftId, ...toRecord(meta) }),
    failed: (giftId: string, error: string, meta?: unknown) =>
      logWithDedup('error', 'Gift failed', { giftId, error, ...toRecord(meta) }),
  },

  // Friendship logging
  friendship: {
    requested: (botId: string, epicId: string, meta?: unknown) =>
      baseLogger.info('Friend request sent', { botName: getBotName(botId), epicId, service: 'bot', ...toRecord(meta) }),
    accepted: (botId: string, epicId: string, meta?: unknown) =>
      baseLogger.info('Friend request accepted', { botName: getBotName(botId), epicId, service: 'bot', ...toRecord(meta) }),
    ready: (botId: string, epicId: string, meta?: unknown) =>
      baseLogger.info('Friendship ready for gifting', { botName: getBotName(botId), epicId, service: 'bot', ...toRecord(meta) }),
  },

  // System logging
  system: {
    startup: (meta?: unknown) => baseLogger.info('System starting up', toRecord(meta)),
    shutdown: (meta?: unknown) => baseLogger.info('System shutting down', toRecord(meta)),
    error: (message: string, meta?: unknown) => logWithDedup('error', `System error: ${message}`, toRecord(meta)),
  },
};

// Legacy export for backwards compatibility
export const botLogger = baseLogger;

export default baseLogger;
