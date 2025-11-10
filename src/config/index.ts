import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment variable schema validation
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // API Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Bot Configuration
  BOT_POOL_SIZE: z.coerce.number().default(5),
  BOT_CHECK_INTERVAL: z.coerce.number().default(60000),
  BOT_RESTART_DELAY: z.coerce.number().default(5000),

  // Gift Limitations
  MAX_GIFTS_PER_DAY: z.coerce.number().default(5),
  FRIENDSHIP_WAIT_HOURS: z.coerce.number().default(48),

  // Queue Configuration
  QUEUE_CONCURRENCY: z.coerce.number().default(3),
  QUEUE_MAX_RETRIES: z.coerce.number().default(3),
  QUEUE_RETRY_DELAY: z.coerce.number().default(60000),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_DIR: z.string().default('./logs'),

  // TODO: Implement generic webhook system that reads webhook URLs from database
  // This will allow dynamic webhook configuration per event type

  // Order Configuration
  PAYMENT_UPLOAD_TIMEOUT_MINUTES: z.coerce.number().default(10),

  // CORS Configuration
  ALLOWED_ORIGINS: z.string().optional(),
  CORS_ALLOWED_DOMAIN: z.string().optional(),
});

// Parse and validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();

// Configuration object
export const config = {
  // Server
  server: {
    port: env.PORT,
    env: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
  },

  // Database
  database: {
    url: env.DATABASE_URL,
  },

  // Redis
  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },

  // Bot
  bot: {
    poolSize: env.BOT_POOL_SIZE,
    checkInterval: env.BOT_CHECK_INTERVAL,
    restartDelay: env.BOT_RESTART_DELAY,
    maxGiftsPerDay: env.MAX_GIFTS_PER_DAY,
    friendshipWaitHours: env.FRIENDSHIP_WAIT_HOURS,
  },

  // Queue
  queue: {
    concurrency: env.QUEUE_CONCURRENCY,
    maxRetries: env.QUEUE_MAX_RETRIES,
    retryDelay: env.QUEUE_RETRY_DELAY,
  },

  // Logging
  logging: {
    level: env.LOG_LEVEL,
    dir: env.LOG_DIR,
  },

  // Order Configuration
  order: {
    paymentUploadTimeoutMinutes: env.PAYMENT_UPLOAD_TIMEOUT_MINUTES,
  },

  // CORS Configuration
  cors: {
    allowedOrigins: env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) || [],
    allowedDomain: env.CORS_ALLOWED_DOMAIN,
  },
} as const;

export default config;
