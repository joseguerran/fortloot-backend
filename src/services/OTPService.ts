import { prisma } from '../database/client';
import { log } from '../utils/logger';
import { EmailService } from './EmailService';
import { WhatsAppService } from './WhatsAppService';
import { ContactType } from '@prisma/client';

const OTP_EXPIRATION_MINUTES = 3;
const OTP_LENGTH = 6;

export class OTPService {
  /**
   * Genera un código OTP de 6 dígitos
   */
  private static generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Solicita un OTP para un cliente basándose en su email o teléfono
   * Retorna el customerId si existe, null si no existe
   */
  static async requestOTP(identifier: string, type: ContactType): Promise<{
    success: boolean;
    customerId?: string;
    message: string;
  }> {
    try {
      // Buscar cliente por email o teléfono según el tipo
      const whereClause = type === 'EMAIL'
        ? { email: identifier }
        : { phoneNumber: identifier };

      const customer = await prisma.customer.findFirst({
        where: whereClause,
      });

      if (!customer) {
        return {
          success: false,
          message: type === 'EMAIL'
            ? 'No encontramos una cuenta con este correo electrónico'
            : 'No encontramos una cuenta con este número de WhatsApp',
        };
      }

      // Invalidar OTPs anteriores no usados
      await prisma.oTPCode.updateMany({
        where: {
          customerId: customer.id,
          usedAt: null,
        },
        data: {
          expiresAt: new Date(), // Expirar inmediatamente
        },
      });

      // Generar nuevo código
      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

      // Guardar código en base de datos
      await prisma.oTPCode.create({
        data: {
          customerId: customer.id,
          code,
          type,
          expiresAt,
        },
      });

      // Enviar código por el medio correspondiente
      let sent = false;
      if (type === 'EMAIL' && customer.email) {
        sent = await EmailService.sendOTPEmail(customer.email, code);
      } else if (type === 'WHATSAPP' && customer.phoneNumber) {
        sent = await WhatsAppService.sendOTP(customer.phoneNumber, code);
      }

      if (!sent) {
        log.error(`Failed to send OTP via ${type} to customer ${customer.id}`);
        return {
          success: false,
          message: type === 'EMAIL'
            ? 'Error al enviar el código por correo. Intenta de nuevo.'
            : 'Error al enviar el código por WhatsApp. Intenta de nuevo.',
        };
      }

      log.info(`OTP sent to customer ${customer.id} via ${type}`);
      return {
        success: true,
        customerId: customer.id,
        message: type === 'EMAIL'
          ? `Código enviado a ${this.maskEmail(identifier)}`
          : `Código enviado a ${this.maskPhone(identifier)}`,
      };
    } catch (error) {
      log.error('Error requesting OTP:', error);
      return {
        success: false,
        message: 'Error interno. Intenta de nuevo.',
      };
    }
  }

  /**
   * Verifica un código OTP
   */
  static async verifyOTP(identifier: string, type: ContactType, code: string): Promise<{
    success: boolean;
    customerId?: string;
    sessionToken?: string;
    message: string;
  }> {
    try {
      // Buscar cliente
      const whereClause = type === 'EMAIL'
        ? { email: identifier }
        : { phoneNumber: identifier };

      const customer = await prisma.customer.findFirst({
        where: whereClause,
      });

      if (!customer) {
        return {
          success: false,
          message: 'Cuenta no encontrada',
        };
      }

      // Buscar OTP válido
      const otpRecord = await prisma.oTPCode.findFirst({
        where: {
          customerId: customer.id,
          code,
          type,
          expiresAt: {
            gt: new Date(),
          },
          usedAt: null,
        },
      });

      if (!otpRecord) {
        return {
          success: false,
          message: 'Código inválido o expirado',
        };
      }

      // Marcar OTP como usado
      await prisma.oTPCode.update({
        where: { id: otpRecord.id },
        data: { usedAt: new Date() },
      });

      log.info(`OTP verified for customer ${customer.id}`);

      return {
        success: true,
        customerId: customer.id,
        sessionToken: customer.sessionToken || undefined,
        message: 'Código verificado correctamente',
      };
    } catch (error) {
      log.error('Error verifying OTP:', error);
      return {
        success: false,
        message: 'Error interno. Intenta de nuevo.',
      };
    }
  }

  /**
   * Oculta parcialmente un email para mostrar al usuario
   */
  private static maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 2) {
      return `${localPart[0]}***@${domain}`;
    }
    return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
  }

  /**
   * Oculta parcialmente un teléfono para mostrar al usuario
   */
  private static maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 4) {
      return `***${digits.slice(-2)}`;
    }
    return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
  }

  /**
   * Solicita un OTP usando el nombre de usuario de Fortnite (displayName)
   */
  static async requestOTPByEpicId(displayName: string): Promise<{
    success: boolean;
    customerId?: string;
    contactMethod?: 'EMAIL' | 'WHATSAPP';
    maskedContact?: string;
    message: string;
  }> {
    try {
      // Normalizar displayName a minúsculas
      const normalizedDisplayName = displayName.toLowerCase();
      log.info(`OTP request for displayName: "${normalizedDisplayName}"`);

      // Buscar cliente por displayName (nombre de usuario de Fortnite)
      const customer = await prisma.customer.findFirst({
        where: {
          displayName: normalizedDisplayName,
        },
      });

      log.info(`Customer found: ${customer ? customer.id : 'null'}, contactPreference: ${customer?.contactPreference}`);

      if (!customer) {
        return {
          success: false,
          message: 'No encontramos una cuenta con este nombre de usuario. Asegúrate de haber realizado al menos una compra.',
        };
      }

      // Verificar que tenga un método de contacto configurado
      const contactType = customer.contactPreference;
      const contactValue = contactType === 'EMAIL' ? customer.email : customer.phoneNumber;

      if (!contactValue) {
        return {
          success: false,
          message: 'No tienes un método de contacto registrado. Contacta a soporte.',
        };
      }

      // Invalidar OTPs anteriores no usados
      await prisma.oTPCode.updateMany({
        where: {
          customerId: customer.id,
          usedAt: null,
        },
        data: {
          expiresAt: new Date(),
        },
      });

      // Generar nuevo código
      const code = this.generateCode();
      const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);

      // Guardar código en base de datos
      await prisma.oTPCode.create({
        data: {
          customerId: customer.id,
          code,
          type: contactType,
          expiresAt,
        },
      });

      // Enviar código por el medio correspondiente
      let sent = false;
      if (contactType === 'EMAIL' && customer.email) {
        sent = await EmailService.sendOTPEmail(customer.email, code);
      } else if (contactType === 'WHATSAPP' && customer.phoneNumber) {
        sent = await WhatsAppService.sendOTP(customer.phoneNumber, code);
      }

      if (!sent) {
        log.error(`Failed to send OTP via ${contactType} to customer ${customer.id}`);
        return {
          success: false,
          message: contactType === 'EMAIL'
            ? 'Error al enviar el código por correo. Intenta de nuevo.'
            : 'Error al enviar el código por WhatsApp. Intenta de nuevo.',
        };
      }

      const maskedContact = contactType === 'EMAIL'
        ? this.maskEmail(contactValue)
        : this.maskPhone(contactValue);

      log.info(`OTP sent to customer ${customer.id} via ${contactType} (displayName lookup)`);
      return {
        success: true,
        customerId: customer.id,
        contactMethod: contactType,
        maskedContact,
        message: contactType === 'EMAIL'
          ? `Código enviado a tu correo: ${maskedContact}`
          : `Código enviado a tu WhatsApp: ${maskedContact}`,
      };
    } catch (error) {
      log.error('Error requesting OTP by Epic ID:', error);
      log.error('Error details:', {
        name: (error as Error).name,
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      return {
        success: false,
        message: 'Error interno. Intenta de nuevo.',
      };
    }
  }

  /**
   * Verifica un código OTP usando el nombre de usuario de Fortnite (displayName)
   */
  static async verifyOTPByEpicId(displayName: string, code: string): Promise<{
    success: boolean;
    customerId?: string;
    sessionToken?: string;
    message: string;
  }> {
    try {
      // Normalizar displayName a minúsculas
      const normalizedDisplayName = displayName.toLowerCase();

      // Buscar cliente por displayName (nombre de usuario de Fortnite)
      const customer = await prisma.customer.findFirst({
        where: {
          displayName: normalizedDisplayName,
        },
      });

      if (!customer) {
        return {
          success: false,
          message: 'Cuenta no encontrada',
        };
      }

      // Buscar OTP válido (cualquier tipo)
      const otpRecord = await prisma.oTPCode.findFirst({
        where: {
          customerId: customer.id,
          code,
          expiresAt: {
            gt: new Date(),
          },
          usedAt: null,
        },
      });

      if (!otpRecord) {
        return {
          success: false,
          message: 'Código inválido o expirado',
        };
      }

      // Marcar OTP como usado
      await prisma.oTPCode.update({
        where: { id: otpRecord.id },
        data: { usedAt: new Date() },
      });

      log.info(`OTP verified for customer ${customer.id} (displayName lookup)`);

      return {
        success: true,
        customerId: customer.id,
        sessionToken: customer.sessionToken || undefined,
        message: 'Código verificado correctamente',
      };
    } catch (error) {
      log.error('Error verifying OTP by Epic ID:', error);
      return {
        success: false,
        message: 'Error interno. Intenta de nuevo.',
      };
    }
  }

  /**
   * Limpia OTPs expirados de la base de datos
   */
  static async cleanupExpiredOTPs(): Promise<number> {
    try {
      const result = await prisma.oTPCode.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: new Date() } },
            { usedAt: { not: null } },
          ],
        },
      });

      if (result.count > 0) {
        log.info(`Cleaned up ${result.count} expired OTP codes`);
      }

      return result.count;
    } catch (error) {
      log.error('Error cleaning up OTPs:', error);
      return 0;
    }
  }
}
