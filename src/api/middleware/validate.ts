import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { log } from '../../utils/logger';

/**
 * Validation middleware factory
 *
 * Usage:
 * router.post('/endpoint', validate(mySchema), controller.method)
 */
export function validate(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request data
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        log.warn('Validation error:', {
          errors,
          url: req.url,
          method: req.method,
          body: req.body
        });

        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors,
        });
      }

      // Unknown error
      log.error('Unexpected validation error:', error);
      next(error);
    }
  };
}

/**
 * Optional validation - allows request to proceed even if validation fails
 * Useful for optional query parameters
 */
export function validateOptional(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      // Attach validated data to request
      (req as any).validated = result;
    } catch (error) {
      // Log but don't block request
      if (error instanceof ZodError) {
        log.debug('Optional validation failed (proceeding anyway):', {
          errors: error.errors,
          url: req.url,
        });
      }
    }

    next();
  };
}
