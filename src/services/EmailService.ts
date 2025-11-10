import nodemailer from 'nodemailer';
import { log } from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private static transporter: nodemailer.Transporter | null = null;

  /**
   * Initialize email transporter
   */
  private static getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
      const smtpPort = parseInt(process.env.SMTP_PORT || '587');
      const smtpUser = process.env.SMTP_USER;
      const smtpPassword = process.env.SMTP_PASSWORD;

      if (!smtpUser || !smtpPassword) {
        log.warn('SMTP credentials not configured. Emails will not be sent.');
        // Return a dummy transporter for development
        this.transporter = nodemailer.createTransport({
          streamTransport: true,
          newline: 'unix',
        });
      } else {
        this.transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPassword,
          },
        });
      }
    }

    return this.transporter;
  }

  /**
   * Send email
   */
  private static async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const transporter = this.getTransporter();

      await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      });

      log.info(`Email sent to ${options.to}: ${options.subject}`);
      return true;
    } catch (error) {
      log.error(`Error sending email to ${options.to}:`, error);
      return false;
    }
  }

  /**
   * Send payment uploaded notification to admin
   */
  static async sendPaymentUploadedNotification(orderNumber: string, amount: number, epicAccountId: string): Promise<boolean> {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      log.warn('ADMIN_EMAIL not configured');
      return false;
    }

    const subject = `💰 Nuevo Comprobante de Pago - Orden ${orderNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF3E9A;">Nuevo Comprobante de Pago Subido</h2>
        <p>Se ha subido un nuevo comprobante de pago que requiere verificación.</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Orden:</strong> ${orderNumber}</p>
          <p><strong>Cliente:</strong> ${epicAccountId}</p>
          <p><strong>Monto:</strong> $${amount.toFixed(2)} USD</p>
        </div>
        <p>Por favor ingresa al panel de administración para verificar el pago.</p>
        <a href="${process.env.ADMIN_PANEL_URL || 'http://localhost:3002'}/payment-verification"
           style="background-color: #FF3E9A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">
          Ver Pagos Pendientes
        </a>
      </div>
    `;

    return this.sendEmail({ to: adminEmail, subject, html });
  }

  /**
   * Send payment verified notification to customer
   */
  static async sendPaymentVerifiedNotification(email: string, orderNumber: string, amount: number): Promise<boolean> {
    const subject = `✅ Pago Verificado - Orden ${orderNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10B981;">¡Pago Verificado!</h2>
        <p>Tu pago ha sido verificado exitosamente.</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Orden:</strong> ${orderNumber}</p>
          <p><strong>Monto:</strong> $${amount.toFixed(2)} USD</p>
          <p><strong>Estado:</strong> Verificado</p>
        </div>
        <p>Tu pedido está siendo procesado y será entregado pronto.</p>
        <p>Puedes ver el estado de tu orden en cualquier momento:</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${orderNumber}"
           style="background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">
          Ver Estado de Orden
        </a>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          Gracias por tu compra en FortLoot!
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send payment rejected notification to customer
   */
  static async sendPaymentRejectedNotification(email: string, orderNumber: string, reason: string): Promise<boolean> {
    const subject = `❌ Pago Rechazado - Orden ${orderNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #EF4444;">Pago Rechazado</h2>
        <p>Tu comprobante de pago ha sido rechazado.</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Orden:</strong> ${orderNumber}</p>
          <p><strong>Razón del rechazo:</strong></p>
          <p style="padding: 10px; background-color: #FEE2E2; border-left: 4px solid #EF4444; margin-top: 10px;">
            ${reason}
          </p>
        </div>
        <p>Por favor verifica tu comprobante y súbelo nuevamente con la información correcta.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${orderNumber}"
           style="background-color: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">
          Reintentar Subir Comprobante
        </a>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          Si tienes dudas, contacta a soporte.
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send payment instructions email
   */
  static async sendPaymentInstructions(email: string, orderNumber: string, amount: number, expiresAt: Date): Promise<boolean> {
    const subject = `📋 Instrucciones de Pago - Orden ${orderNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF3E9A;">Orden Creada - Instrucciones de Pago</h2>
        <p>Tu orden ha sido creada exitosamente. Por favor realiza el pago siguiendo las instrucciones.</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Orden:</strong> ${orderNumber}</p>
          <p><strong>Monto a Pagar:</strong> $${amount.toFixed(2)} USD</p>
          <p><strong>Expira:</strong> ${expiresAt.toLocaleString('es')}</p>
        </div>

        <h3 style="color: #333; margin-top: 30px;">Métodos de Pago Disponibles:</h3>

        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <h4 style="margin-top: 0; color: #FF3E9A;">Transferencia Bancaria</h4>
          <p><strong>Banco:</strong> Banco Example</p>
          <p><strong>Cuenta:</strong> 1234567890</p>
          <p><strong>Titular:</strong> FortLoot LLC</p>
        </div>

        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <h4 style="margin-top: 0; color: #FF3E9A;">PayPal</h4>
          <p><strong>Email:</strong> payments@fortloot.com</p>
        </div>

        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <h4 style="margin-top: 0; color: #FF3E9A;">Criptomonedas</h4>
          <p><strong>USDT (TRC20):</strong> TExampleAddress123...</p>
          <p><strong>BTC:</strong> bc1qexample...</p>
        </div>

        <div style="background-color: #FEF3C7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0;"><strong>⚠ Importante:</strong> Después de realizar el pago, sube tu comprobante en la página de tu orden. El pago será verificado manualmente.</p>
        </div>

        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${orderNumber}"
           style="background-color: #FF3E9A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">
          Subir Comprobante de Pago
        </a>

        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          Gracias por tu compra en FortLoot!
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send order completed notification
   */
  static async sendOrderCompletedNotification(email: string, orderNumber: string): Promise<boolean> {
    const subject = `🎁 Orden Completada - ${orderNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10B981;">¡Orden Completada!</h2>
        <p>Tu orden ha sido completada y los items han sido enviados a tu cuenta de Fortnite.</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Orden:</strong> ${orderNumber}</p>
          <p><strong>Estado:</strong> ✅ Completada</p>
        </div>
        <p>Verifica tu cuenta de Fortnite para ver tus nuevos items!</p>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          Gracias por confiar en FortLoot. ¡Esperamos verte pronto!
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }
}
