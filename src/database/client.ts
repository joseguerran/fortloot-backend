import { PrismaClient } from '@prisma/client';
import { log } from '../utils/logger';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption';

// Fields that should be encrypted
const ENCRYPTED_FIELDS = ['deviceId', 'accountId', 'secret'] as const;

// Helper function to detect database connection errors
function isConnectionError(error: any): boolean {
  if (!error) return false;
  const message = error?.message || '';
  const code = error?.code || '';
  return (
    message.includes('Connection') ||
    message.includes('Closed') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ETIMEDOUT') ||
    code === 'P1001' || // Connection error
    code === 'P1002' || // Connection timed out
    code === 'P1008' || // Operations timed out
    code === 'P1017'    // Server closed connection
  );
}

// Initialize base Prisma Client with logging
const basePrisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

// Extend Prisma Client with retry logic for connection errors
const prismaWithRetry = basePrisma.$extends({
  name: 'retry-extension',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const maxRetries = 3;
        let lastError: any;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await query(args);
          } catch (error: any) {
            lastError = error;

            if (isConnectionError(error) && attempt < maxRetries) {
              log.warn(`Database connection error on ${model}.${operation}, retry ${attempt}/${maxRetries}`, {
                error: error.message,
                code: error.code,
              });

              // Exponential backoff: 1s, 2s, 4s
              await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));

              // Try to reconnect
              try {
                await basePrisma.$disconnect();
                await basePrisma.$connect();
                log.info('Database reconnected successfully');
              } catch (reconnectError) {
                log.error('Failed to reconnect to database', reconnectError);
              }
            } else {
              throw error;
            }
          }
        }

        throw lastError;
      },
    },
  },
});

// Extend Prisma Client with encryption/decryption using Prisma 6 Client Extensions
const prisma = prismaWithRetry.$extends({
  name: 'encryption-extension',
  query: {
    bot: {
      // Encrypt before create
      async create({ args, query }) {
        if (args.data) {
          for (const field of ENCRYPTED_FIELDS) {
            const value = args.data[field];
            if (value && typeof value === 'string' && !isEncrypted(value)) {
              try {
                args.data[field] = encrypt(value);
                log.debug(`Encrypted field: ${field}`);
              } catch (error) {
                log.error(`Failed to encrypt field ${field}`, error);
                throw new Error(`Encryption failed for ${field}`);
              }
            }
          }
        }
        const result = await query(args);
        return decryptBot(result);
      },

      // Encrypt before update
      async update({ args, query }) {
        if (args.data) {
          for (const field of ENCRYPTED_FIELDS) {
            const value = args.data[field];
            if (value && typeof value === 'string' && !isEncrypted(value)) {
              try {
                args.data[field] = encrypt(value);
                log.debug(`Encrypted field: ${field}`);
              } catch (error) {
                log.error(`Failed to encrypt field ${field}`, error);
                throw new Error(`Encryption failed for ${field}`);
              }
            }
          }
        }
        const result = await query(args);
        return decryptBot(result);
      },

      // Encrypt before upsert
      async upsert({ args, query }) {
        if (args.create) {
          for (const field of ENCRYPTED_FIELDS) {
            const value = args.create[field];
            if (value && typeof value === 'string' && !isEncrypted(value)) {
              try {
                args.create[field] = encrypt(value);
              } catch (error) {
                log.error(`Failed to encrypt field ${field}`, error);
                throw new Error(`Encryption failed for ${field}`);
              }
            }
          }
        }
        if (args.update) {
          for (const field of ENCRYPTED_FIELDS) {
            const value = args.update[field];
            if (value && typeof value === 'string' && !isEncrypted(value)) {
              try {
                args.update[field] = encrypt(value);
              } catch (error) {
                log.error(`Failed to encrypt field ${field}`, error);
                throw new Error(`Encryption failed for ${field}`);
              }
            }
          }
        }
        const result = await query(args);
        return decryptBot(result);
      },

      // Decrypt after read operations
      async findUnique({ args, query }) {
        const result = await query(args);
        return decryptBot(result);
      },
      async findFirst({ args, query }) {
        const result = await query(args);
        return decryptBot(result);
      },
      async findMany({ args, query }) {
        const result = await query(args);
        return Array.isArray(result) ? result.map(decryptBot) : result;
      },
    },
  },
});

// Helper function to decrypt bot fields
function decryptBot(bot: any) {
  if (!bot) return bot;

  for (const field of ENCRYPTED_FIELDS) {
    if (bot[field] && typeof bot[field] === 'string') {
      try {
        if (isEncrypted(bot[field])) {
          bot[field] = decrypt(bot[field]);
        }
      } catch (error) {
        log.error(`Failed to decrypt field ${field} for bot ${bot.id}`, error);
        // Don't throw, just log - allow operation to continue
        bot[field] = null;
      }
    }
  }

  return bot;
}

// Log slow queries
basePrisma.$on('query' as never, (e: any) => {
  if (e.duration > 1000) {
    log.warn('Slow query detected', {
      query: e.query,
      duration: `${e.duration}ms`,
    });
  }
});

// Log errors
basePrisma.$on('error' as never, (e: any) => {
  log.error('Prisma error', e);
});

// Log warnings
basePrisma.$on('warn' as never, (e: any) => {
  log.warn('Prisma warning', e);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await basePrisma.$disconnect();
    log.info('Database connection closed');
  } catch (error) {
    log.error('Error closing database connection', error);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { prisma };
export default prisma;
