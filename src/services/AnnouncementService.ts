import { prisma } from '../database/client';
import { Announcement, AnnouncementType, Prisma } from '@prisma/client';
import { log } from '../utils/logger';

export interface CreateAnnouncementInput {
  type: AnnouncementType;
  title: string;
  message: string;
  imageUrl?: string;
  productId?: string;
  linkUrl?: string;
  linkText?: string;
  isActive?: boolean;
  priority?: number;
  startsAt?: Date;
  endsAt?: Date;
}

export interface UpdateAnnouncementInput {
  type?: AnnouncementType;
  title?: string;
  message?: string;
  imageUrl?: string | null;
  productId?: string | null;
  linkUrl?: string | null;
  linkText?: string | null;
  isActive?: boolean;
  priority?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
}

export interface AnnouncementWithProduct extends Announcement {
  product?: {
    id: string;
    name: string;
    image: string;
    type: string;
  } | null;
}

export class AnnouncementService {
  /**
   * Get all announcements with optional filters
   */
  static async getAll(filters?: {
    type?: AnnouncementType;
    isActive?: boolean;
  }): Promise<AnnouncementWithProduct[]> {
    try {
      const where: Prisma.AnnouncementWhereInput = {};

      if (filters?.type) {
        where.type = filters.type;
      }

      if (filters?.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      const announcements = await prisma.announcement.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              type: true,
            },
          },
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      return announcements;
    } catch (error) {
      log.error('Error fetching announcements:', error);
      throw new Error('Failed to fetch announcements');
    }
  }

  /**
   * Get active announcements (considering schedule)
   */
  static async getActive(): Promise<AnnouncementWithProduct[]> {
    try {
      const now = new Date();

      const announcements = await prisma.announcement.findMany({
        where: {
          isActive: true,
          OR: [
            // No schedule set
            {
              startsAt: null,
              endsAt: null,
            },
            // Within schedule
            {
              startsAt: { lte: now },
              endsAt: { gte: now },
            },
            // Started but no end date
            {
              startsAt: { lte: now },
              endsAt: null,
            },
            // Not started yet but no start date
            {
              startsAt: null,
              endsAt: { gte: now },
            },
          ],
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              type: true,
            },
          },
        },
        orderBy: [
          { type: 'asc' }, // MAINTENANCE first
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      return announcements;
    } catch (error) {
      log.error('Error fetching active announcements:', error);
      throw new Error('Failed to fetch active announcements');
    }
  }

  /**
   * Get maintenance status
   */
  static async getMaintenanceStatus(): Promise<{
    isMaintenanceMode: boolean;
    announcement: AnnouncementWithProduct | null;
  }> {
    try {
      const now = new Date();

      const maintenanceAnnouncement = await prisma.announcement.findFirst({
        where: {
          type: 'MAINTENANCE',
          isActive: true,
          OR: [
            { startsAt: null, endsAt: null },
            { startsAt: { lte: now }, endsAt: { gte: now } },
            { startsAt: { lte: now }, endsAt: null },
            { startsAt: null, endsAt: { gte: now } },
          ],
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              type: true,
            },
          },
        },
        orderBy: { priority: 'desc' },
      });

      return {
        isMaintenanceMode: !!maintenanceAnnouncement,
        announcement: maintenanceAnnouncement,
      };
    } catch (error) {
      log.error('Error fetching maintenance status:', error);
      throw new Error('Failed to fetch maintenance status');
    }
  }

  /**
   * Get a single announcement by ID
   */
  static async getById(id: string): Promise<AnnouncementWithProduct | null> {
    try {
      const announcement = await prisma.announcement.findUnique({
        where: { id },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              type: true,
            },
          },
        },
      });

      return announcement;
    } catch (error) {
      log.error(`Error fetching announcement ${id}:`, error);
      throw new Error('Failed to fetch announcement');
    }
  }

  /**
   * Create a new announcement
   */
  static async create(input: CreateAnnouncementInput): Promise<AnnouncementWithProduct> {
    try {
      // If creating an active MAINTENANCE announcement, deactivate any existing ones
      if (input.type === 'MAINTENANCE' && input.isActive) {
        await this.deactivateAllMaintenance();
      }

      // Validate productId exists if provided
      if (input.productId) {
        const product = await prisma.catalogItem.findUnique({
          where: { id: input.productId },
        });
        if (!product) {
          throw new Error('Product not found');
        }
      }

      const announcement = await prisma.announcement.create({
        data: {
          type: input.type,
          title: input.title,
          message: input.message,
          imageUrl: input.imageUrl,
          productId: input.productId,
          linkUrl: input.linkUrl,
          linkText: input.linkText,
          isActive: input.isActive ?? false,
          priority: input.priority ?? 0,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              type: true,
            },
          },
        },
      });

      log.info(`Announcement created: ${announcement.id} (${announcement.type})`);
      return announcement;
    } catch (error) {
      log.error('Error creating announcement:', error);
      throw error;
    }
  }

  /**
   * Update an announcement
   */
  static async update(id: string, input: UpdateAnnouncementInput): Promise<AnnouncementWithProduct> {
    try {
      const existing = await prisma.announcement.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error('Announcement not found');
      }

      // If activating a MAINTENANCE announcement, deactivate others
      const willBeMaintenance = input.type === 'MAINTENANCE' || (input.type === undefined && existing.type === 'MAINTENANCE');
      const willBeActive = input.isActive === true || (input.isActive === undefined && existing.isActive);

      if (willBeMaintenance && willBeActive) {
        await this.deactivateAllMaintenance(id);
      }

      // Validate productId exists if provided
      if (input.productId) {
        const product = await prisma.catalogItem.findUnique({
          where: { id: input.productId },
        });
        if (!product) {
          throw new Error('Product not found');
        }
      }

      const announcement = await prisma.announcement.update({
        where: { id },
        data: {
          type: input.type,
          title: input.title,
          message: input.message,
          imageUrl: input.imageUrl,
          productId: input.productId,
          linkUrl: input.linkUrl,
          linkText: input.linkText,
          isActive: input.isActive,
          priority: input.priority,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              type: true,
            },
          },
        },
      });

      log.info(`Announcement updated: ${announcement.id}`);
      return announcement;
    } catch (error) {
      log.error(`Error updating announcement ${id}:`, error);
      throw error;
    }
  }

  /**
   * Toggle announcement active status
   */
  static async toggle(id: string): Promise<AnnouncementWithProduct> {
    try {
      const existing = await prisma.announcement.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error('Announcement not found');
      }

      const newIsActive = !existing.isActive;

      // If activating a MAINTENANCE announcement, deactivate others
      if (existing.type === 'MAINTENANCE' && newIsActive) {
        await this.deactivateAllMaintenance(id);
      }

      const announcement = await prisma.announcement.update({
        where: { id },
        data: { isActive: newIsActive },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              image: true,
              type: true,
            },
          },
        },
      });

      log.info(`Announcement toggled: ${announcement.id} -> ${newIsActive ? 'active' : 'inactive'}`);
      return announcement;
    } catch (error) {
      log.error(`Error toggling announcement ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete an announcement
   */
  static async delete(id: string): Promise<void> {
    try {
      const existing = await prisma.announcement.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new Error('Announcement not found');
      }

      await prisma.announcement.delete({
        where: { id },
      });

      log.info(`Announcement deleted: ${id}`);
    } catch (error) {
      log.error(`Error deleting announcement ${id}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate all MAINTENANCE announcements except the specified one
   */
  private static async deactivateAllMaintenance(exceptId?: string): Promise<void> {
    try {
      const where: Prisma.AnnouncementWhereInput = {
        type: 'MAINTENANCE',
        isActive: true,
      };

      if (exceptId) {
        where.id = { not: exceptId };
      }

      await prisma.announcement.updateMany({
        where,
        data: { isActive: false },
      });

      log.info('Deactivated all MAINTENANCE announcements');
    } catch (error) {
      log.error('Error deactivating maintenance announcements:', error);
      throw error;
    }
  }
}
