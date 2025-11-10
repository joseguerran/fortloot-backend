// Custom error classes for Fortloot Bot System

export class FortlootError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, code: string, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Bot-related errors
export class BotError extends FortlootError {
  constructor(message: string, code = 'BOT_ERROR') {
    super(message, code, 500);
  }
}

export class BotOfflineError extends BotError {
  constructor(botId: string) {
    super(`Bot ${botId} is offline`, 'BOT_OFFLINE');
  }
}

export class BotBusyError extends BotError {
  constructor(botId: string) {
    super(`Bot ${botId} is busy`, 'BOT_BUSY');
  }
}

export class BotAuthError extends BotError {
  constructor(message: string) {
    super(message, 'BOT_AUTH_FAILED');
  }
}

export class BotNoGiftsAvailableError extends BotError {
  constructor(botId: string) {
    super(`Bot ${botId} has no gifts available today`, 'BOT_NO_GIFTS');
  }
}

// Gift-related errors
export class GiftError extends FortlootError {
  constructor(message: string, code = 'GIFT_ERROR') {
    super(message, code, 500);
  }
}

export class GiftLimitExceededError extends GiftError {
  constructor() {
    super('Daily gift limit exceeded', 'GIFT_LIMIT_EXCEEDED');
  }
}

export class GiftNotFriendsError extends GiftError {
  constructor(epicId: string) {
    super(`Not friends with ${epicId}`, 'GIFT_NOT_FRIENDS');
  }
}

export class GiftWaitPeriodError extends GiftError {
  constructor(hoursRemaining: number) {
    super(
      `Must wait ${hoursRemaining} more hours before gifting`,
      'GIFT_WAIT_PERIOD'
    );
  }
}

export class GiftInvalidItemError extends GiftError {
  constructor(itemId: string) {
    super(`Invalid or ungiftable item: ${itemId}`, 'GIFT_INVALID_ITEM');
  }
}

export class GiftEpicApiError extends GiftError {
  constructor(message: string, epicCode?: string) {
    super(`Epic Games API error: ${message}`, epicCode || 'GIFT_EPIC_ERROR');
  }
}

// Order-related errors
export class OrderError extends FortlootError {
  constructor(message: string, code = 'ORDER_ERROR', statusCode = 400) {
    super(message, code, statusCode);
  }
}

export class OrderNotFoundError extends OrderError {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`, 'ORDER_NOT_FOUND', 404);
  }
}

export class OrderAlreadyProcessedError extends OrderError {
  constructor(orderId: string) {
    super(`Order ${orderId} already processed`, 'ORDER_ALREADY_PROCESSED', 400);
  }
}

export class OrderValidationError extends OrderError {
  constructor(message: string) {
    super(message, 'ORDER_VALIDATION_ERROR', 400);
  }
}

// Friendship-related errors
export class FriendshipError extends FortlootError {
  constructor(message: string, code = 'FRIENDSHIP_ERROR') {
    super(message, code, 500);
  }
}

export class FriendshipAlreadyExistsError extends FriendshipError {
  constructor(epicId: string) {
    super(`Friendship with ${epicId} already exists`, 'FRIENDSHIP_EXISTS');
  }
}

export class FriendshipNotFoundError extends FriendshipError {
  constructor(epicId: string) {
    super(`Friendship with ${epicId} not found`, 'FRIENDSHIP_NOT_FOUND');
  }
}

// Queue-related errors
export class QueueError extends FortlootError {
  constructor(message: string, code = 'QUEUE_ERROR') {
    super(message, code, 500);
  }
}

export class QueueMaxRetriesError extends QueueError {
  constructor(jobId: string) {
    super(`Job ${jobId} exceeded max retries`, 'QUEUE_MAX_RETRIES');
  }
}

// Database errors
export class DatabaseError extends FortlootError {
  constructor(message: string, code = 'DATABASE_ERROR') {
    super(message, code, 500, false);
  }
}

// API errors
export class ApiError extends FortlootError {
  constructor(message: string, code = 'API_ERROR', statusCode = 400) {
    super(message, code, statusCode);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class RateLimitError extends ApiError {
  constructor(message = 'Too many requests') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
  }
}

// Error handler utility
export const handleError = (error: unknown): FortlootError => {
  if (error instanceof FortlootError) {
    return error;
  }

  if (error instanceof Error) {
    return new FortlootError(error.message, 'UNKNOWN_ERROR', 500, false);
  }

  return new FortlootError('An unknown error occurred', 'UNKNOWN_ERROR', 500, false);
};

// Check if error is operational (safe to continue)
export const isOperationalError = (error: unknown): boolean => {
  if (error instanceof FortlootError) {
    return error.isOperational;
  }
  return false;
};
