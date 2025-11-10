// Helper utility functions

import { addHours, differenceInHours, differenceInMilliseconds, isPast } from 'date-fns';
import { prisma } from '../database/client';

/**
 * Calculate when a friendship will be ready for gifting (48 hours after friending)
 */
export const calculateCanGiftAt = (friendedAt: Date, waitHours = 48): Date => {
  return addHours(friendedAt, waitHours);
};

/**
 * Check if friendship is ready for gifting
 */
export const isFriendshipReady = (canGiftAt: Date): boolean => {
  return isPast(canGiftAt);
};

/**
 * Calculate hours remaining until friendship is ready
 */
export const getHoursUntilReady = (canGiftAt: Date): number => {
  const hours = differenceInHours(canGiftAt, new Date());
  return Math.max(0, hours);
};

/**
 * Calculate gifts sent by a bot in the last 24 hours
 * Queries the Gift table directly - single source of truth
 */
export const calculateGiftsToday = async (botId: string): Promise<number> => {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const count = await prisma.gift.count({
    where: {
      botId,
      status: 'SENT',
      sentAt: {
        gte: twentyFourHoursAgo,
        lte: new Date()
      }
    }
  });

  return count;
};

/**
 * Calculate gifts available for a bot
 * Based on actual Gift records, not counters
 */
export const calculateGiftsAvailable = async (
  botId: string,
  maxGiftsPerDay: number
): Promise<number> => {
  const giftsToday = await calculateGiftsToday(botId);
  return Math.max(0, maxGiftsPerDay - giftsToday);
};

/**
 * Add random delay to simulate human behavior
 */
export const randomDelay = (min = 1000, max = 3000): Promise<void> => {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
};

/**
 * Retry a function with exponential backoff
 */
export const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> => {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
};

/**
 * Calculate estimated delivery time based on current state
 */
export const calculateEstimatedDelivery = (
  friendshipStatus: string,
  canGiftAt: Date,
  queueLength: number,
  avgProcessingTime = 5 // minutes
): Date => {
  const now = new Date();

  // If waiting for friendship, use canGiftAt
  if (friendshipStatus === 'WAIT_PERIOD' || friendshipStatus === 'PENDING') {
    const waitTime = differenceInMilliseconds(canGiftAt, now);
    const queueTime = queueLength * avgProcessingTime * 60 * 1000;
    return new Date(now.getTime() + waitTime + queueTime);
  }

  // If ready, just add queue time
  const queueTime = queueLength * avgProcessingTime * 60 * 1000;
  return new Date(now.getTime() + queueTime);
};

/**
 * Format Epic Account ID (just in case it comes in different formats)
 */
export const normalizeEpicId = (epicId: string): string => {
  return epicId.trim().toLowerCase();
};

/**
 * Validate Epic Account ID format
 */
export const isValidEpicId = (epicId: string): boolean => {
  // Epic IDs are typically 32 character hex strings
  return /^[a-f0-9]{32}$/i.test(epicId);
};

/**
 * Validate Fortnite item ID (CID, EID, BID, etc.)
 */
export const isValidItemId = (itemId: string): boolean => {
  // Fortnite item IDs follow patterns like CID_XXX, EID_XXX, BID_XXX
  return /^(CID|EID|BID|Pickaxe|Glider|Wrap|MusicPack)_[A-Z0-9_]+$/i.test(itemId);
};

/**
 * Get product type from item ID
 */
export const getProductTypeFromItemId = (itemId: string): string => {
  const prefix = itemId.split('_')[0].toUpperCase();

  const typeMap: Record<string, string> = {
    CID: 'SKIN',
    EID: 'EMOTE',
    BID: 'BACKPACK',
    PICKAXE: 'PICKAXE',
    GLIDER: 'GLIDER',
    WRAP: 'WRAP',
    MUSICPACK: 'OTHER',
  };

  return typeMap[prefix] || 'OTHER';
};

/**
 * Generate a safe bot name
 */
export const generateBotName = (index: number): string => {
  const adjectives = ['Swift', 'Quick', 'Mega', 'Ultra', 'Super', 'Hyper', 'Epic', 'Prime'];
  const nouns = ['Bot', 'Agent', 'Helper', 'Ninja', 'Gifter', 'Guardian', 'Master', 'Pro'];

  const adj = adjectives[index % adjectives.length];
  const noun = nouns[Math.floor(index / adjectives.length) % nouns.length];

  return `${adj}${noun}${index}`;
};

/**
 * Calculate success rate percentage
 */
export const calculateSuccessRate = (successful: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((successful / total) * 100 * 100) / 100;
};

/**
 * Calculate bot utilization rate
 */
export const calculateUtilizationRate = (
  giftsUsed: number,
  maxGifts: number
): number => {
  if (maxGifts === 0) return 0;
  return Math.round((giftsUsed / maxGifts) * 100 * 100) / 100;
};

/**
 * Sanitize user input
 */
export const sanitizeInput = (input: string): string => {
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Sleep utility
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Chunk array into smaller arrays
 */
export const chunk = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Get priority order for queue
 */
export const getPriorityValue = (priority: string): number => {
  const priorityMap: Record<string, number> = {
    LOW: 1,
    NORMAL: 2,
    HIGH: 3,
    VIP: 4,
  };

  return priorityMap[priority] || 2;
};
