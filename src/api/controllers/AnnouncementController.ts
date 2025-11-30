import { Request, Response } from 'express';
import { AnnouncementService } from '../../services/AnnouncementService';
import { AnnouncementType } from '@prisma/client';
import { log } from '../../utils/logger';

export class AnnouncementController {
  /**
   * Get all announcements (admin)
   * GET /api/announcements
   */
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { type, isActive } = req.query;

      const filters: { type?: AnnouncementType; isActive?: boolean } = {};

      if (type && (type === 'MAINTENANCE' || type === 'PROMOTION')) {
        filters.type = type as AnnouncementType;
      }

      if (isActive !== undefined) {
        filters.isActive = isActive === 'true';
      }

      const announcements = await AnnouncementService.getAll(filters);

      res.json({
        success: true,
        data: announcements,
      });
    } catch (error: any) {
      log.error('Error fetching announcements:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch announcements',
      });
    }
  }

  /**
   * Get active announcements (public)
   * GET /api/announcements/active
   */
  static async getActive(req: Request, res: Response): Promise<void> {
    try {
      const announcements = await AnnouncementService.getActive();

      res.json({
        success: true,
        data: announcements,
      });
    } catch (error: any) {
      log.error('Error fetching active announcements:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch active announcements',
      });
    }
  }

  /**
   * Get maintenance status (public)
   * GET /api/announcements/maintenance
   */
  static async getMaintenanceStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await AnnouncementService.getMaintenanceStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      log.error('Error fetching maintenance status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch maintenance status',
      });
    }
  }

  /**
   * Get a single announcement (admin)
   * GET /api/announcements/:id
   */
  static async getOne(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const announcement = await AnnouncementService.getById(id);

      if (!announcement) {
        res.status(404).json({
          success: false,
          error: 'Announcement not found',
        });
        return;
      }

      res.json({
        success: true,
        data: announcement,
      });
    } catch (error: any) {
      log.error('Error fetching announcement:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch announcement',
      });
    }
  }

  /**
   * Create a new announcement (admin)
   * POST /api/announcements
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const {
        type,
        title,
        message,
        imageUrl,
        productId,
        linkUrl,
        linkText,
        isActive,
        priority,
        startsAt,
        endsAt,
      } = req.body;

      // Validate required fields (only type is required, title and message are optional)
      if (!type) {
        res.status(400).json({
          success: false,
          error: 'type is required',
        });
        return;
      }

      // Validate type
      if (type !== 'MAINTENANCE' && type !== 'PROMOTION') {
        res.status(400).json({
          success: false,
          error: 'type must be MAINTENANCE or PROMOTION',
        });
        return;
      }

      const announcement = await AnnouncementService.create({
        type,
        title,
        message,
        imageUrl,
        productId,
        linkUrl,
        linkText,
        isActive,
        priority,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined,
      });

      log.info(`Announcement created: ${announcement.id} by user ${(req as any).user?.email || 'unknown'}`);

      res.status(201).json({
        success: true,
        data: announcement,
      });
    } catch (error: any) {
      log.error('Error creating announcement:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create announcement',
      });
    }
  }

  /**
   * Update an announcement (admin)
   * PATCH /api/announcements/:id
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        type,
        title,
        message,
        imageUrl,
        productId,
        linkUrl,
        linkText,
        isActive,
        priority,
        startsAt,
        endsAt,
      } = req.body;

      // Validate type if provided
      if (type && type !== 'MAINTENANCE' && type !== 'PROMOTION') {
        res.status(400).json({
          success: false,
          error: 'type must be MAINTENANCE or PROMOTION',
        });
        return;
      }

      const announcement = await AnnouncementService.update(id, {
        type,
        title,
        message,
        imageUrl,
        productId,
        linkUrl,
        linkText,
        isActive,
        priority,
        startsAt: startsAt ? new Date(startsAt) : startsAt === null ? null : undefined,
        endsAt: endsAt ? new Date(endsAt) : endsAt === null ? null : undefined,
      });

      log.info(`Announcement updated: ${announcement.id} by user ${(req as any).user?.email || 'unknown'}`);

      res.json({
        success: true,
        data: announcement,
      });
    } catch (error: any) {
      log.error('Error updating announcement:', error);

      if (error.message === 'Announcement not found') {
        res.status(404).json({
          success: false,
          error: 'Announcement not found',
        });
        return;
      }

      if (error.message === 'Product not found') {
        res.status(400).json({
          success: false,
          error: 'Product not found',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update announcement',
      });
    }
  }

  /**
   * Toggle announcement active status (admin)
   * POST /api/announcements/:id/toggle
   */
  static async toggle(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const announcement = await AnnouncementService.toggle(id);

      log.info(`Announcement toggled: ${announcement.id} -> ${announcement.isActive ? 'active' : 'inactive'} by user ${(req as any).user?.email || 'unknown'}`);

      res.json({
        success: true,
        data: announcement,
      });
    } catch (error: any) {
      log.error('Error toggling announcement:', error);

      if (error.message === 'Announcement not found') {
        res.status(404).json({
          success: false,
          error: 'Announcement not found',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to toggle announcement',
      });
    }
  }

  /**
   * Delete an announcement (admin)
   * DELETE /api/announcements/:id
   */
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await AnnouncementService.delete(id);

      log.info(`Announcement deleted: ${id} by user ${(req as any).user?.email || 'unknown'}`);

      res.json({
        success: true,
        message: 'Announcement deleted successfully',
      });
    } catch (error: any) {
      log.error('Error deleting announcement:', error);

      if (error.message === 'Announcement not found') {
        res.status(404).json({
          success: false,
          error: 'Announcement not found',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete announcement',
      });
    }
  }

  /**
   * Upload image for announcement (admin)
   * POST /api/announcements/upload-image
   * Converts image to base64 data URI for storage in database
   */
  static async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file;

      if (!file) {
        res.status(400).json({
          success: false,
          error: 'No image file provided',
        });
        return;
      }

      // Convert buffer to base64 data URI
      const base64 = file.buffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${base64}`;

      log.info(`Announcement image converted to base64 by user ${(req as any).user?.email || 'unknown'} (size: ${Math.round(file.size / 1024)}KB)`);

      res.json({
        success: true,
        data: {
          url: dataUri,
          size: file.size,
          mimeType,
        },
      });
    } catch (error: any) {
      log.error('Error uploading announcement image:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload image',
      });
    }
  }
}
