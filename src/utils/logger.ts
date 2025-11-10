import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config';
import path from 'path';
import fs from 'fs';

// Ensure log directory exists
if (!fs.existsSync(config.logging.dir)) {
  fs.mkdirSync(config.logging.dir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create daily rotate file transport for all logs
const allLogsTransport = new DailyRotateFile({
  filename: path.join(config.logging.dir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: fileFormat,
});

// Create daily rotate file transport for error logs
const errorLogsTransport = new DailyRotateFile({
  filename: path.join(config.logging.dir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: fileFormat,
});

// Create daily rotate file transport for bot logs
const botLogsTransport = new DailyRotateFile({
  filename: path.join(config.logging.dir, 'bot-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '7d',
  format: fileFormat,
});

// Create the logger
const logger = winston.createLogger({
  level: config.logging.level,
  transports: [
    // Console output
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File outputs
    allLogsTransport,
    errorLogsTransport,
  ],
  // Handle exceptions and rejections
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

// Create a child logger for bot-specific logs
export const botLogger = logger.child({}).add(botLogsTransport);

// Helper methods for structured logging
export const log = {
  error: (message: string, meta?: unknown) => logger.error(message, meta),
  warn: (message: string, meta?: unknown) => logger.warn(message, meta),
  info: (message: string, meta?: unknown) => logger.info(message, meta),
  debug: (message: string, meta?: unknown) => logger.debug(message, meta),

  // Bot-specific logging
  bot: {
    error: (botId: string, message: string, meta?: Record<string, any>) =>
      botLogger.error(message, { botId, ...(meta || {}) }),
    warn: (botId: string, message: string, meta?: Record<string, any>) =>
      botLogger.warn(message, { botId, ...(meta || {}) }),
    info: (botId: string, message: string, meta?: Record<string, any>) =>
      botLogger.info(message, { botId, ...(meta || {}) }),
    debug: (botId: string, message: string, meta?: Record<string, any>) =>
      botLogger.debug(message, { botId, ...(meta || {}) }),
  },

  // Order-specific logging
  order: {
    created: (orderId: string, meta?: Record<string, any>) =>
      logger.info('Order created', { orderId, ...(meta || {}) }),
    updated: (orderId: string, status: string, meta?: Record<string, any>) =>
      logger.info('Order updated', { orderId, status, ...(meta || {}) }),
    completed: (orderId: string, meta?: Record<string, any>) =>
      logger.info('Order completed', { orderId, ...(meta || {}) }),
    failed: (orderId: string, reason: string, meta?: Record<string, any>) =>
      logger.error('Order failed', { orderId, reason, ...(meta || {}) }),
  },

  // Gift-specific logging
  gift: {
    queued: (giftId: string, meta?: Record<string, any>) =>
      logger.info('Gift queued', { giftId, ...(meta || {}) }),
    sending: (giftId: string, meta?: Record<string, any>) =>
      logger.info('Gift sending', { giftId, ...(meta || {}) }),
    sent: (giftId: string, meta?: Record<string, any>) =>
      logger.info('Gift sent successfully', { giftId, ...(meta || {}) }),
    failed: (giftId: string, error: string, meta?: Record<string, any>) =>
      logger.error('Gift failed', { giftId, error, ...(meta || {}) }),
  },

  // Friendship logging
  friendship: {
    requested: (botId: string, epicId: string, meta?: Record<string, any>) =>
      logger.info('Friend request sent', { botId, epicId, ...(meta || {}) }),
    accepted: (botId: string, epicId: string, meta?: Record<string, any>) =>
      logger.info('Friend request accepted', { botId, epicId, ...(meta || {}) }),
    ready: (botId: string, epicId: string, meta?: Record<string, any>) =>
      logger.info('Friendship ready for gifting', { botId, epicId, ...(meta || {}) }),
  },

  // System logging
  system: {
    startup: (meta?: Record<string, any>) => logger.info('System starting up', meta || {}),
    shutdown: (meta?: Record<string, any>) => logger.info('System shutting down', meta || {}),
    error: (message: string, meta?: Record<string, any>) => logger.error(`System error: ${message}`, meta || {}),
  },
};

export default logger;
