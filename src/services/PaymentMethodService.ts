import { prisma } from '../database/client';
import { PaymentMethod } from '@prisma/client';
import { log } from '../utils/logger';

export class PaymentMethodService {
  /**
   * Get all payment methods
   */
  static async getAll(onlyActive: boolean = false): Promise<PaymentMethod[]> {
    try {
      const where = onlyActive ? { isActive: true } : {};

      const methods = await prisma.paymentMethod.findMany({
        where,
        orderBy: [
          { displayOrder: 'asc' },
          { name: 'asc' }
        ]
      });

      return methods;
    } catch (error) {
      log.error('Error fetching payment methods:', error);
      throw new Error('Failed to fetch payment methods');
    }
  }

  /**
   * Get payment method by ID
   */
  static async getById(id: string): Promise<PaymentMethod | null> {
    try {
      const method = await prisma.paymentMethod.findUnique({
        where: { id }
      });

      return method;
    } catch (error) {
      log.error(`Error fetching payment method ${id}:`, error);
      throw new Error('Failed to fetch payment method');
    }
  }

  /**
   * Get payment method by slug
   */
  static async getBySlug(slug: string): Promise<PaymentMethod | null> {
    try {
      const method = await prisma.paymentMethod.findUnique({
        where: { slug }
      });

      return method;
    } catch (error) {
      log.error(`Error fetching payment method by slug ${slug}:`, error);
      throw new Error('Failed to fetch payment method');
    }
  }

  /**
   * Create a new payment method
   */
  static async create(data: {
    name: string;
    slug: string;
    description?: string;
    icon?: string;
    isActive?: boolean;
    displayOrder?: number;
    instructions?: string;
    accountInfo?: any;
    metadata?: any;
  }): Promise<PaymentMethod> {
    try {
      // Check if slug already exists
      const existing = await prisma.paymentMethod.findUnique({
        where: { slug: data.slug }
      });

      if (existing) {
        throw new Error(`Payment method with slug '${data.slug}' already exists`);
      }

      const method = await prisma.paymentMethod.create({
        data: {
          name: data.name,
          slug: data.slug,
          description: data.description,
          icon: data.icon,
          isActive: data.isActive ?? true,
          displayOrder: data.displayOrder ?? 0,
          instructions: data.instructions,
          accountInfo: data.accountInfo,
          metadata: data.metadata
        }
      });

      log.info(`Payment method created: ${method.slug}`);
      return method;
    } catch (error) {
      log.error('Error creating payment method:', error);
      throw error;
    }
  }

  /**
   * Update payment method
   */
  static async update(
    id: string,
    data: Partial<{
      name: string;
      slug: string;
      description: string | null;
      icon: string | null;
      isActive: boolean;
      displayOrder: number;
      instructions: string | null;
      accountInfo: any;
      metadata: any;
    }>
  ): Promise<PaymentMethod> {
    try {
      // Check if payment method exists
      const existing = await prisma.paymentMethod.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new Error(`Payment method with ID '${id}' not found`);
      }

      // If updating slug, check if new slug is already in use
      if (data.slug && data.slug !== existing.slug) {
        const slugInUse = await prisma.paymentMethod.findUnique({
          where: { slug: data.slug }
        });

        if (slugInUse) {
          throw new Error(`Payment method with slug '${data.slug}' already exists`);
        }
      }

      const method = await prisma.paymentMethod.update({
        where: { id },
        data
      });

      log.info(`Payment method updated: ${method.slug}`);
      return method;
    } catch (error) {
      log.error(`Error updating payment method ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete payment method
   */
  static async delete(id: string): Promise<void> {
    try {
      const existing = await prisma.paymentMethod.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new Error(`Payment method with ID '${id}' not found`);
      }

      await prisma.paymentMethod.delete({
        where: { id }
      });

      log.info(`Payment method deleted: ${existing.slug}`);
    } catch (error) {
      log.error(`Error deleting payment method ${id}:`, error);
      throw error;
    }
  }

  /**
   * Toggle payment method active status
   */
  static async toggleActive(id: string): Promise<PaymentMethod> {
    try {
      const existing = await prisma.paymentMethod.findUnique({
        where: { id }
      });

      if (!existing) {
        throw new Error(`Payment method with ID '${id}' not found`);
      }

      const method = await prisma.paymentMethod.update({
        where: { id },
        data: { isActive: !existing.isActive }
      });

      log.info(`Payment method ${method.slug} active status toggled to: ${method.isActive}`);
      return method;
    } catch (error) {
      log.error(`Error toggling payment method ${id}:`, error);
      throw error;
    }
  }

  /**
   * Reorder payment methods
   */
  static async reorder(items: { id: string; displayOrder: number }[]): Promise<void> {
    try {
      await prisma.$transaction(
        items.map(item =>
          prisma.paymentMethod.update({
            where: { id: item.id },
            data: { displayOrder: item.displayOrder }
          })
        )
      );

      log.info(`Payment methods reordered: ${items.length} items`);
    } catch (error) {
      log.error('Error reordering payment methods:', error);
      throw new Error('Failed to reorder payment methods');
    }
  }
}
