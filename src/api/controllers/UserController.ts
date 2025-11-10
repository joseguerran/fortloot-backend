import { Response } from 'express';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import { hashPassword, generateApiKey, validatePasswordStrength } from '../../utils/password';
import { AuthenticatedRequest } from '../middleware/rbac';
import { UserRole } from '@prisma/client';

/**
 * UserController - Manage users (ADMIN/SUPER_ADMIN only)
 */
export class UserController {
  /**
   * Get all users
   */
  static async getAllUsers(req: AuthenticatedRequest, res: Response) {
    try {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          lastLogin: true,
          lastLoginIp: true,
          loginCount: true,
          createdAt: true,
          updatedAt: true,
          // Don't include passwordHash or apiKey
        },
      });

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      log.error('Failed to get users', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve users',
      });
    }
  }

  /**
   * Get user by ID
   */
  static async getUser(req: AuthenticatedRequest, res: Response) {
    const { userId } = req.params;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          lastLogin: true,
          lastLoginIp: true,
          loginCount: true,
          createdAt: true,
          updatedAt: true,
          apiKey: true, // Include for viewing
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      log.error('Failed to get user', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve user',
      });
    }
  }

  /**
   * Create a new user
   */
  static async createUser(req: AuthenticatedRequest, res: Response) {
    const { username, email, password, role } = req.body;

    // Validation
    if (!username || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Username, email, password, and role are required',
      });
    }

    // Validate role
    const validRoles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ROLE',
        message: `Role must be one of: ${validRoles.join(', ')}`,
      });
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: passwordError,
      });
    }

    try {
      // Check if username already exists
      const existingUsername = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUsername) {
        return res.status(400).json({
          success: false,
          error: 'USERNAME_EXISTS',
          message: 'Username already exists',
        });
      }

      // Check if email already exists
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingEmail) {
        return res.status(400).json({
          success: false,
          error: 'EMAIL_EXISTS',
          message: 'Email already exists',
        });
      }

      // Hash password and generate API key
      const passwordHash = await hashPassword(password);
      const apiKey = generateApiKey();

      // Create user
      const user = await prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          apiKey,
          role,
          isActive: true,
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          apiKey: true,
          createdAt: true,
        },
      });

      log.info('User created', {
        userId: user.id,
        username: user.username,
        role: user.role,
        createdBy: req.user?.username,
      });

      res.status(201).json({
        success: true,
        data: user,
        message: 'User created successfully',
      });
    } catch (error) {
      log.error('Failed to create user', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to create user',
      });
    }
  }

  /**
   * Update user
   */
  static async updateUser(req: AuthenticatedRequest, res: Response) {
    const { userId } = req.params;
    const { email, role, isActive } = req.body;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      // Validate role if provided
      if (role) {
        const validRoles: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'VIEWER'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_ROLE',
            message: `Role must be one of: ${validRoles.join(', ')}`,
          });
        }
      }

      // Build update data
      const updateData: any = {};
      if (email !== undefined) updateData.email = email;
      if (role !== undefined) updateData.role = role;
      if (isActive !== undefined) updateData.isActive = isActive;

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      });

      log.info('User updated', {
        userId: updatedUser.id,
        username: updatedUser.username,
        changes: updateData,
        updatedBy: req.user?.username,
      });

      res.json({
        success: true,
        data: updatedUser,
        message: 'User updated successfully',
      });
    } catch (error) {
      log.error('Failed to update user', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to update user',
      });
    }
  }

  /**
   * Delete user (SUPER_ADMIN only)
   */
  static async deleteUser(req: AuthenticatedRequest, res: Response) {
    const { userId } = req.params;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      // Prevent deleting yourself
      if (userId === req.user?.id) {
        return res.status(400).json({
          success: false,
          error: 'CANNOT_DELETE_SELF',
          message: 'Cannot delete your own user account',
        });
      }

      // Delete user
      await prisma.user.delete({
        where: { id: userId },
      });

      log.info('User deleted', {
        userId: user.id,
        username: user.username,
        deletedBy: req.user?.username,
      });

      res.json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      log.error('Failed to delete user', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to delete user',
      });
    }
  }

  /**
   * Regenerate user's API key
   */
  static async regenerateApiKey(req: AuthenticatedRequest, res: Response) {
    const { userId } = req.params;

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      // Generate new API key
      const newApiKey = generateApiKey();

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { apiKey: newApiKey },
        select: {
          id: true,
          username: true,
          apiKey: true,
        },
      });

      log.info('API key regenerated', {
        userId: updatedUser.id,
        username: updatedUser.username,
        regeneratedBy: req.user?.username,
      });

      res.json({
        success: true,
        data: {
          apiKey: updatedUser.apiKey,
        },
        message: 'API key regenerated successfully',
      });
    } catch (error) {
      log.error('Failed to regenerate API key', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to regenerate API key',
      });
    }
  }

  /**
   * Reset user password (ADMIN only)
   */
  static async resetPassword(req: AuthenticatedRequest, res: Response) {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'New password is required',
      });
    }

    // Validate password strength
    const passwordError = validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: passwordError,
      });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      // Hash new password
      const passwordHash = await hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      log.info('User password reset', {
        userId: user.id,
        username: user.username,
        resetBy: req.user?.username,
      });

      res.json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      log.error('Failed to reset password', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to reset password',
      });
    }
  }
}
