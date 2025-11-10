import { Request, Response, NextFunction } from 'express';
import { FortlootError, isOperationalError } from '../../utils/errors';
import { log } from '../../utils/logger';

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  log.error('Request error', {
    method: req.method,
    path: req.path,
    error: error.message,
    stack: error.stack,
  });

  // Handle known errors
  if (error instanceof FortlootError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.code,
      message: error.message,
    });
  }

  // Handle unknown errors
  const statusCode = 500;
  const errorResponse = {
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    (errorResponse as any).stack = error.stack;
  }

  return res.status(statusCode).json(errorResponse);
};

/**
 * Not found handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
};

/**
 * Async handler wrapper to catch errors
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
