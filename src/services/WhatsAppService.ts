import { log } from '../utils/logger';
import { ConfigService } from './ConfigService';

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
   */
  static async notifyOrderCreated(
    orderNumber: string,
    epicAccountId: string,
    amount: number,
    itemCount: number
  ): Promise<boolean> {
    if (!await this.isEnabled()) return false;

    const message = `🛒 *Nueva Orden Creada*

📦 Orden: ${orderNumber}
👤 Cliente: ${epicAccountId}
💰 Monto: $${amount.toFixed(2)} USD
🎮 Items: ${itemCount}

⏳ Esperando comprobante de pago...`;

    return this.sendMessage(this.adminPhone!, message);
  }

  /**
   * Notifica al admin cuando se sube un comprobante de pago
   */
  static async notifyPaymentUploaded(
    orderNumber: string,
    epicAccountId: string,
    amount: number
  ): Promise<boolean> {
    if (!await this.isEnabled()) return false;

    const message = `💰 *Comprobante de Pago Subido*

📦 Orden: ${orderNumber}
👤 Cliente: ${epicAccountId}
💵 Monto: $${amount.toFixed(2)} USD

🔍 Requiere verificación manual.`;

    return this.sendMessage(this.adminPhone!, message);
  }
}
