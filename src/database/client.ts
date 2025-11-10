import { PrismaClient } from '@prisma/client';
import { log } from '../utils/logger';
import { encrypt, decrypt, isEncrypted } from '../utils/encryption';

// Fields that should be encrypted
const ENCRYPTED_FIELDS = ['deviceId', 'accountId', 'secret'] as const;

// Initialize base Prisma Client with logging
const basePrisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'event' },
    { level: 'warn', emit: 'event' },
  ],
});

// Extend Prisma Client with encryption/decryption using Prisma 6 Client Extensions
const prisma = basePrisma.$extends({
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
