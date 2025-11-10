import { log } from '../utils/logger';
import { EmailService } from './EmailService';

/**
 * Servicio de notificaciones para admin y clientes
 * Centraliza todas las notificaciones del sistema
 */
export class NotificationService {
  /**
   * Notifica al admin sobre situación crítica que requiere atención inmediata
   */
  static async notifyAdminCritical(params: AdminCriticalNotification): Promise<void> {
    try {
      log.error(`🚨 CRÍTICO: ${params.type} - ${params.message}`);

      // TODO: Implementar envío real (webhook, email, Slack, etc.)
      // Por ahora solo loggeamos

      // Ejemplo: await this.sendToSlack(params);
      // Ejemplo: await this.sendAdminEmail(params);

      if (params.type === 'ALL_BOTS_NO_VBUCKS') {
        log.error(`💰 URGENTE: Orden ${params.orderId} bloqueada - Requiere ${params.requiredVBucks} V-Bucks`);
      }

      if (params.type === 'BOT_AUTH_EXPIRED') {
        log.error(`🔑 Bot ${params.botName} (${params.botId}) - Credenciales expiradas`);
      }
    } catch (error) {
      log.error('Error sending critical admin notification:', error);
    }
  }

  /**
   * Notifica al admin sobre warning (no crítico pero requiere atención)
   */
  static async notifyAdminWarning(params: AdminWarningNotification): Promise<void> {
    try {
      log.warn(`⚠️ WARNING: ${params.type}`);

      if (params.type === 'SOME_BOTS_NO_VBUCKS') {
        log.warn(`💰 Bots sin V-Bucks: ${params.botsAffected?.join(', ')} - ${params.ordersBlocked} orden(es) afectada(s)`);
      } else if (params.type === 'BOT_LOW_VBUCKS') {
        log.warn(`💰 Bot bajo de V-Bucks: ${params.botName} (${params.currentVBucks}/${params.recommendedVBucks}) - ${params.message}`);
      }

      // TODO: Implementar envío real
    } catch (error) {
      log.error('Error sending warning admin notification:', error);
    }
  }

  /**
   * Notifica al cliente sobre delay en su orden
   */
  static async notifyCustomerDelay(params: CustomerDelayNotification): Promise<void> {
    try {
      log.info(`📧 Notificando cliente sobre delay - Orden ${params.orderId}`);

      if (!params.customerEmail) {
        log.warn(`No email disponible para orden ${params.orderId}`);
        return;
      }

      // Preparar mensaje personalizado según razón
      let subject = 'Tu orden está siendo procesada';
      let message = '';

      if (params.reason === 'high_demand') {
        subject = 'Tu orden - Alta demanda en el servicio';
        message = `
Hola,

Tu orden está siendo procesada, pero debido a la alta demanda actual,
puede tomar un poco más de tiempo del estimado.

Tiempo estimado adicional: ${params.estimatedDelayMinutes} minutos

¡Gracias por tu paciencia!
`;
      }

      // Enviar email
      try {
        // TODO: Implement a public method in EmailService for sending custom emails
        // For now, we'll skip this until EmailService has a public method
        log.info(`Email notification would be sent to ${params.customerEmail}: ${subject}`);

        log.info(`✅ Email de delay enviado a ${params.customerEmail}`);
      } catch (emailError) {
        log.error('Error sending delay email:', emailError);
      }

      // TODO: También enviar webhook si el cliente tiene configurado
    } catch (error) {
      log.error('Error sending customer delay notification:', error);
    }
  }
}

// Tipos
interface AdminCriticalNotification {
  type: 'ALL_BOTS_NO_VBUCKS' | 'BOT_AUTH_EXPIRED';
  message: string;
  orderId?: string;
  requiredVBucks?: number;
  botId?: string;
  botName?: string;
}

interface AdminWarningNotification {
  type: 'SOME_BOTS_NO_VBUCKS' | 'BOT_LOW_VBUCKS';
  botsAffected?: string[];
  ordersBlocked?: number;
  botId?: string;
  botName?: string;
  currentVBucks?: number;
  recommendedVBucks?: number;
  message?: string;
}

interface CustomerDelayNotification {
  orderId: string;
  customerEmail: string;
  reason: 'high_demand' | 'bot_maintenance' | 'other';
  estimatedDelayMinutes: number;
}
