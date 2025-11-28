import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from '../../utils/errors';

/**
 * Validation middleware factory
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
        throw new ValidationError(messages.join(', '));
      }
      throw error;
    }
  };
};

// Common validation schemas
export const orderCreateSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  // Legacy fields - deprecated, optional for backward compatibility
  customerEpicId: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  productId: z.string().min(1, 'Product ID is required'),
  productName: z.string().min(1, 'Product name is required'),
  productType: z.enum([
    'VBUCKS',
    'SKIN',
    'EMOTE',
    'PICKAXE',
    'GLIDER',
    'BACKPACK',
    'WRAP',
    'BATTLE_PASS',
    'BUNDLE',
    'OTHER',
  ]),
  itemId: z.string().min(1, 'Item ID is required'),
  quantity: z.number().int().positive().default(1),
  price: z.number().positive('Price must be positive'),
  currency: z.string().default('USD'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'VIP']).default('NORMAL'),
});

export const friendshipRequestSchema = z.object({
  botId: z.string().uuid().optional(),
  epicAccountId: z.string().min(1, 'Epic Account ID is required'),
  displayName: z.string().min(1, 'Display name is required'),
  orderId: z.string().uuid().optional(),
});
