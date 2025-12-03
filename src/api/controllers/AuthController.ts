import { Response } from 'express';
import { prisma } from '../../database/client';
import { log } from '../../utils/logger';
import { verifyPassword } from '../../utils/password';
import { AuthenticatedRequest } from '../middleware/rbac';
import { audit } from '../middleware/auditLog';
import { WhatsAppService } from '../../services/WhatsAppService';

const OTP_EXPIRATION_MINUTES = 3;

/**
 * AuthController - Handle authentication operations
 */
export class AuthController {
  /**
   * Genera un código OTP de 6 dígitos
   */
  private static generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Login with username and password
   * Step 1: Validates credentials and sends OTP via WhatsApp
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
          message: 'Credenciales inválidas',
        });
      }

      // Check if user is active
      if (!user.isActive) {
        log.warn('Login attempt for inactive user', { username });
        return res.status(401).json({
          success: false,
          error: 'ACCOUNT_INACTIVE',
          message: 'La cuenta está inactiva',
        });
      }

      // Check if user has a password set
      if (!user.passwordHash) {
        log.warn('Login attempt for user without password', { username });
        return res.status(401).json({
          success: false,
          error: 'ACCOUNT_NOT_ACTIVATED',
          message: 'La cuenta no ha sido activada. Usa el enlace de invitación.',
        });
      }

      // Verify password
      const isPasswordValid = await verifyPassword(password, user.passwordHash);

      if (!isPasswordValid) {
        log.warn('Login attempt with invalid password', { username });
        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Credenciales inválidas',
        });
      }

      // Check if user has phone number for OTP
      if (!user.phoneNumber) {
        log.warn('Login attempt for user without phone number', { username });
        return res.status(400).json({
          success: false,
          error: 'NO_PHONE_NUMBER',
          message: 'No tienes un número de teléfono configurado para OTP. Contacta al administrador.',
        });
      }

      // Generate OTP and save to user
      const otpCode = AuthController.generateOTP();
      const otpExpiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          otpCode,
          otpExpiresAt,
        },
      });

      // Send OTP via WhatsApp
      const sent = await WhatsAppService.sendOTP(user.phoneNumber, otpCode);

      if (!sent) {
        log.error(`Failed to send OTP to user ${user.id}`);
        return res.status(500).json({
          success: false,
          error: 'OTP_SEND_FAILED',
          message: 'Error al enviar el código OTP. Intenta de nuevo.',
        });
      }

      log.info('OTP sent for login', {
        userId: user.id,
        username: user.username,
      });

      // Return success with masked phone
      const maskedPhone = user.phoneNumber.slice(-4);
      res.json({
        success: true,
        data: {
          message: 'Código OTP enviado',
          phoneLastDigits: maskedPhone,
          expiresIn: OTP_EXPIRATION_MINUTES * 60, // seconds
        },
      });
    } catch (error) {
      log.error('Login error', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al iniciar sesión',
      });
    }
  }

  /**
   * Verify OTP and return API key
   * Step 2: Validates OTP code and returns user info + apiKey
   */
  static async verifyOTP(req: AuthenticatedRequest, res: Response) {
    const { username, otp } = req.body;

    if (!username || !otp) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Username and OTP are required',
      });
    }

    try {
      // Find user by username
      const user = await prisma.user.findUnique({
        where: { username },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_VERIFICATION',
          message: 'Verificación inválida',
        });
      }

      // Check if OTP exists and is valid
      if (!user.otpCode || !user.otpExpiresAt) {
        return res.status(401).json({
          success: false,
          error: 'NO_OTP_PENDING',
          message: 'No hay código OTP pendiente. Inicia sesión nuevamente.',
        });
      }

      // Check if OTP is expired
      if (new Date() > user.otpExpiresAt) {
        // Clear expired OTP
        await prisma.user.update({
          where: { id: user.id },
          data: {
            otpCode: null,
            otpExpiresAt: null,
          },
        });

        return res.status(401).json({
          success: false,
          error: 'OTP_EXPIRED',
          message: 'El código OTP ha expirado. Inicia sesión nuevamente.',
        });
      }

      // Verify OTP
      if (user.otpCode !== otp) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_OTP',
          message: 'Código OTP inválido',
        });
      }

      // Clear OTP and update login info
      await prisma.user.update({
        where: { id: user.id },
        data: {
          otpCode: null,
          otpExpiresAt: null,
          lastLogin: new Date(),
          lastLoginIp: req.ip || null,
          loginCount: { increment: 1 },
        },
      });

      // Audit log
      await audit.userLogin(user.id, user.username, req.ip || 'unknown');

      log.info('User logged in successfully via OTP', {
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
            lastLogin: new Date(),
          },
          apiKey: user.apiKey,
          message: 'Login exitoso',
        },
      });
    } catch (error) {
      log.error('OTP verification error', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Error al verificar OTP',
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
