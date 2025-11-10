import { Response } from 'express';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import { verifyPassword } from '../../utils/password';
import { AuthenticatedRequest } from '../middleware/rbac';
import { audit } from '../middleware/auditLog';

/**
 * AuthController - Handle authentication operations
 */
export class AuthController {
  /**
   * Login with username and password
   * Returns user info and API key
   */
  static async login(req: AuthenticatedRequest, res: Response) {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Username and password are required',
      });
    }

    try {
      // Find user by username
      const user = await prisma.user.findUnique({
        where: { username },
      });

      if (!user) {
        log.warn('Login attempt with invalid username', { username });
        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        });
      }

      // Check if user is active
      if (!user.isActive) {
        log.warn('Login attempt for inactive user', { username });
        return res.status(401).json({
          success: false,
          error: 'ACCOUNT_INACTIVE',
          message: 'User account is inactive',
        });
      }

      // Verify password
      const isPasswordValid = await verifyPassword(password, user.passwordHash);

      if (!isPasswordValid) {
        log.warn('Login attempt with invalid password', { username });
        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
        });
      }

      // Update login info
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          lastLoginIp: req.ip || null,
          loginCount: { increment: 1 },
        },
      });

      // Audit log
      await audit.userLogin(user.id, user.username, req.ip || 'unknown');

      log.info('User logged in successfully', {
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      // Return user info and API key
      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            lastLogin: user.lastLogin,
          },
          apiKey: user.apiKey,
          message: 'Login successful',
        },
      });
    } catch (error) {
      log.error('Login error', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Login failed',
      });
    }
  }

  /**
   * Get current authenticated user info
   */
  static async me(req: AuthenticatedRequest, res: Response) {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    try {
      // Get full user info from database
      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
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
        },
      });

      if (!fullUser) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      res.json({
        success: true,
        data: fullUser,
      });
    } catch (error) {
      log.error('Failed to get user info', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get user information',
      });
    }
  }

  /**
   * Logout (optional - mainly for audit trail)
   */
  static async logout(req: AuthenticatedRequest, res: Response) {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    try {
      // Audit log
      await audit.userLogout(user.id, user.username, req.ip || 'unknown');

      log.info('User logged out', {
        userId: user.id,
        username: user.username,
      });

      res.json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      log.error('Logout error', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Logout failed',
      });
    }
  }

  /**
   * Change password
   */
  static async changePassword(req: AuthenticatedRequest, res: Response) {
    const user = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Not authenticated',
      });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Current password and new password are required',
      });
    }

    try {
      // Get user with password hash
      const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
      });

      if (!fullUser) {
        return res.status(404).json({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
      }

      // Verify current password
      const isPasswordValid = await verifyPassword(currentPassword, fullUser.passwordHash);

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_PASSWORD',
          message: 'Current password is incorrect',
        });
      }

      // Hash new password
      const bcrypt = require('bcrypt');
      const newPasswordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newPasswordHash,
        },
      });

      log.info('User changed password', {
        userId: user.id,
        username: user.username,
      });

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      log.error('Failed to change password', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to change password',
      });
    }
  }
}
