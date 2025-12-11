import { log } from '../utils/logger';
import { ConfigService } from './ConfigService';
import { t, Locale } from './LocalizationService';

export class WhatsAppService {
  private static wahaUrl = process.env.WAHA_API_URL || 'http://localhost:3003';
  private static wahaApiKey = process.env.WAHA_API_KEY;
  private static adminPhone = process.env.ADMIN_WHATSAPP;

  /**
   * Verifica si WhatsApp está habilitado y configurado
   */
  private static async isEnabled(): Promise<boolean> {
    if (!this.adminPhone) {
      log.debug('WhatsApp notifications disabled: ADMIN_WHATSAPP not configured');
      return false;
    }
    if (!this.wahaUrl) {
      log.debug('WhatsApp notifications disabled: WAHA_API_URL not configured');
      return false;
    }
    return await ConfigService.isWhatsAppEnabled();
  }

  /**
   * Envía mensaje a un número de WhatsApp via WAHA
   */
  private static async sendMessage(phone: string, message: string): Promise<boolean> {
    try {
      // Formatear número: quitar caracteres no numéricos y agregar sufijo
      const chatId = phone.replace(/\D/g, '') + '@c.us';

      // Construir headers con autenticación si está configurada
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.wahaApiKey) {
        headers['X-Api-Key'] = this.wahaApiKey;
      }

      const response = await fetch(`${this.wahaUrl}/api/sendText`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chatId,
          text: message,
          session: 'default'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WAHA responded with ${response.status}: ${errorText}`);
      }

      log.info(`WhatsApp message sent to ${phone}`);
      return true;
    } catch (error) {
      log.error('Error sending WhatsApp message:', error);
      return false;
    }
  }

  /**
   * Notifica al admin cuando se crea una nueva orden
   * (Always in Spanish for internal admin use)
   */
  static async notifyOrderCreated(
    orderNumber: string,
    epicAccountId: string,
    amount: number,
    itemCount: number
  ): Promise<boolean> {
    if (!await this.isEnabled()) return false;

    // Admin messages always in Spanish
    const locale: Locale = 'es';
    const message = `${t('orderCreated.icon', locale, 'whatsapp')} *${t('orderCreated.title', locale, 'whatsapp')}*

📦 ${t('common.order', locale, 'whatsapp')}: ${orderNumber}
👤 ${t('common.customer', locale, 'whatsapp')}: ${epicAccountId}
💰 ${t('common.amount', locale, 'whatsapp')}: $${amount.toFixed(2)} USD
🎮 ${t('orderCreated.items', locale, 'whatsapp')}: ${itemCount}

⏳ ${t('orderCreated.waiting', locale, 'whatsapp')}`;

    return this.sendMessage(this.adminPhone!, message);
  }

  /**
   * Notifica al admin cuando se sube un comprobante de pago
   * (Always in Spanish for internal admin use)
   */
  static async notifyPaymentUploaded(
    orderNumber: string,
    epicAccountId: string,
    amount: number
  ): Promise<boolean> {
    if (!await this.isEnabled()) return false;

    // Admin messages always in Spanish
    const locale: Locale = 'es';
    const message = `${t('paymentUploaded.icon', locale, 'whatsapp')} *${t('paymentUploaded.title', locale, 'whatsapp')}*

📦 ${t('common.order', locale, 'whatsapp')}: ${orderNumber}
👤 ${t('common.customer', locale, 'whatsapp')}: ${epicAccountId}
💵 ${t('common.amount', locale, 'whatsapp')}: $${amount.toFixed(2)} USD

🔍 ${t('paymentUploaded.action', locale, 'whatsapp')}`;

    return this.sendMessage(this.adminPhone!, message);
  }

  /**
   * Envía código OTP al cliente vía WhatsApp
   * Este método NO requiere que esté habilitado para admin, solo WAHA
   * Uses customer's preferred language
   */
  static async sendOTP(phone: string, code: string, locale: Locale = 'es'): Promise<boolean> {
    if (!this.wahaUrl) {
      log.error('WhatsApp OTP disabled: WAHA_API_URL not configured');
      return false;
    }

    const message = `${t('otpCode.icon', locale, 'whatsapp')} *${t('otpCode.title', locale, 'whatsapp')}*

${t('otpCode.codeLabel', locale, 'whatsapp')} *${code}*

⏰ ${t('otpCode.expiry', locale, 'whatsapp')}

${t('otpCode.ignore', locale, 'whatsapp')}`;

    return this.sendMessage(phone, message);
  }
}
