import { Resend } from 'resend';
import { log } from '../utils/logger';
import { t, Locale } from './LocalizationService';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private static resend: Resend | null = null;
  private static fromEmail: string = 'FortLoot <noreply@fortloot.com>';

  /**
   * Get Resend client instance
   */
  private static getClient(): Resend | null {
    if (!this.resend) {
      const apiKey = process.env.RESEND_API_KEY;

      if (!apiKey) {
        log.warn('RESEND_API_KEY not configured. Emails will not be sent.');
        return null;
      }

      this.resend = new Resend(apiKey);

      // Allow custom from email
      if (process.env.RESEND_FROM_EMAIL) {
        this.fromEmail = process.env.RESEND_FROM_EMAIL;
      }
    }

    return this.resend;
  }

  /**
   * Send email using Resend
   */
  private static async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const client = this.getClient();

      if (!client) {
        log.warn(`Email not sent (Resend not configured): ${options.subject} to ${options.to}`);
        return false;
      }

      const { data, error } = await client.emails.send({
        from: this.fromEmail,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || options.html.replace(/<[^>]*>/g, ''),
      });

      if (error) {
        log.error(`Resend error sending email to ${options.to}:`, error);
        return false;
      }

      log.info(`Email sent to ${options.to}: ${options.subject} (id: ${data?.id})`);
      return true;
    } catch (error) {
      log.error(`Error sending email to ${options.to}:`, error);
      return false;
    }
  }

  /**
   * Send payment uploaded notification to admin (always in Spanish for internal use)
   */
  static async sendPaymentUploadedNotification(orderNumber: string, amount: number, epicAccountId: string): Promise<boolean> {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      log.warn('ADMIN_EMAIL not configured');
      return false;
    }

    // Admin emails always in Spanish
    const locale: Locale = 'es';
    const subject = t('paymentUploaded.subject', locale, 'emails', { orderNumber });
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF3E9A;">${t('paymentUploaded.title', locale, 'emails')}</h2>
        <p>${t('paymentUploaded.body', locale, 'emails')}</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>${t('common.order', locale, 'emails')}:</strong> ${orderNumber}</p>
          <p><strong>${t('common.customer', locale, 'emails')}:</strong> ${epicAccountId}</p>
          <p><strong>${t('common.amount', locale, 'emails')}:</strong> $${amount.toFixed(2)} USD</p>
        </div>
        <p>${t('paymentUploaded.action', locale, 'emails')}</p>
        <a href="${process.env.ADMIN_PANEL_URL || 'http://localhost:3002'}/payment-verification"
           style="background-color: #FF3E9A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">
          ${t('paymentUploaded.button', locale, 'emails')}
        </a>
      </div>
    `;

    return this.sendEmail({ to: adminEmail, subject, html });
  }

  /**
   * Send payment verified notification to customer
   */
  static async sendPaymentVerifiedNotification(
    email: string,
    orderNumber: string,
    amount: number,
    locale: Locale = 'es'
  ): Promise<boolean> {

    const subject = t('paymentVerified.subject', locale, 'emails', { orderNumber });
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10B981;">${t('paymentVerified.title', locale, 'emails')}</h2>
        <p>${t('paymentVerified.body', locale, 'emails')}</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>${t('common.order', locale, 'emails')}:</strong> ${orderNumber}</p>
          <p><strong>${t('common.amount', locale, 'emails')}:</strong> $${amount.toFixed(2)} USD</p>
          <p><strong>${t('common.status', locale, 'emails')}:</strong> ${locale === 'en' ? 'Verified' : 'Verificado'}</p>
        </div>
        <p>${t('paymentVerified.processing', locale, 'emails')}</p>
        <p>${t('paymentVerified.viewOrder', locale, 'emails')}</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/${locale}/order-status/${orderNumber}"
           style="background-color: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">
          ${t('paymentVerified.button', locale, 'emails')}
        </a>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          ${t('common.thankYou', locale, 'emails')}
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send payment rejected notification to customer
   */
  static async sendPaymentRejectedNotification(
    email: string,
    orderNumber: string,
    reason: string,
    locale: Locale = 'es'
  ): Promise<boolean> {

    const subject = t('paymentRejected.subject', locale, 'emails', { orderNumber });
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #EF4444;">${t('paymentRejected.title', locale, 'emails')}</h2>
        <p>${t('paymentRejected.body', locale, 'emails')}</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>${t('common.order', locale, 'emails')}:</strong> ${orderNumber}</p>
          <p><strong>${t('paymentRejected.reason', locale, 'emails')}</strong></p>
          <p style="padding: 10px; background-color: #FEE2E2; border-left: 4px solid #EF4444; margin-top: 10px;">
            ${reason}
          </p>
        </div>
        <p>${t('paymentRejected.action', locale, 'emails')}</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/${locale}/order-status/${orderNumber}"
           style="background-color: #EF4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">
          ${t('paymentRejected.button', locale, 'emails')}
        </a>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          ${t('common.support', locale, 'emails')}
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send payment instructions email
   */
  static async sendPaymentInstructions(
    email: string,
    orderNumber: string,
    amount: number,
    expiresAt: Date,
    locale: Locale = 'es'
  ): Promise<boolean> {

    const subject = t('paymentInstructions.subject', locale, 'emails', { orderNumber });
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF3E9A;">${t('paymentInstructions.title', locale, 'emails')}</h2>
        <p>${t('paymentInstructions.body', locale, 'emails')}</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>${t('common.order', locale, 'emails')}:</strong> ${orderNumber}</p>
          <p><strong>${t('common.amount', locale, 'emails')}:</strong> $${amount.toFixed(2)} USD</p>
          <p><strong>${locale === 'en' ? 'Expires' : 'Expira'}:</strong> ${expiresAt.toLocaleString(locale === 'en' ? 'en' : 'es')}</p>
        </div>

        <h3 style="color: #333; margin-top: 30px;">${t('paymentInstructions.methodsTitle', locale, 'emails')}</h3>

        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <h4 style="margin-top: 0; color: #FF3E9A;">${locale === 'en' ? 'Bank Transfer' : 'Transferencia Bancaria'}</h4>
          <p><strong>${locale === 'en' ? 'Bank' : 'Banco'}:</strong> Banco Example</p>
          <p><strong>${locale === 'en' ? 'Account' : 'Cuenta'}:</strong> 1234567890</p>
          <p><strong>${locale === 'en' ? 'Account Holder' : 'Titular'}:</strong> FortLoot LLC</p>
        </div>

        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <h4 style="margin-top: 0; color: #FF3E9A;">PayPal</h4>
          <p><strong>Email:</strong> payments@fortloot.com</p>
        </div>

        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <h4 style="margin-top: 0; color: #FF3E9A;">${locale === 'en' ? 'Cryptocurrency' : 'Criptomonedas'}</h4>
          <p><strong>USDT (TRC20):</strong> TExampleAddress123...</p>
          <p><strong>BTC:</strong> bc1qexample...</p>
        </div>

        <div style="background-color: #FEF3C7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0;"><strong>${locale === 'en' ? 'Important' : 'Importante'}:</strong> ${t('paymentInstructions.important', locale, 'emails')}</p>
        </div>

        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/${locale}/order-status/${orderNumber}"
           style="background-color: #FF3E9A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px;">
          ${t('paymentInstructions.button', locale, 'emails')}
        </a>

        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          ${t('common.thankYou', locale, 'emails')}
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send order completed notification
   */
  static async sendOrderCompletedNotification(
    email: string,
    orderNumber: string,
    locale: Locale = 'es'
  ): Promise<boolean> {

    const subject = t('orderCompleted.subject', locale, 'emails', { orderNumber });
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10B981;">${t('orderCompleted.title', locale, 'emails')}</h2>
        <p>${t('orderCompleted.body', locale, 'emails')}</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>${t('common.order', locale, 'emails')}:</strong> ${orderNumber}</p>
          <p><strong>${t('common.status', locale, 'emails')}:</strong> ${locale === 'en' ? 'Completed' : 'Completada'}</p>
        </div>
        <p>${t('orderCompleted.action', locale, 'emails')}</p>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          ${t('orderCompleted.footer', locale, 'emails')}
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send OTP verification code
   */
  static async sendOTPEmail(email: string, code: string, locale: Locale = 'es'): Promise<boolean> {

    const subject = t('otpCode.subject', locale, 'emails');
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #FF3E9A;">${t('otpCode.title', locale, 'emails')}</h2>
        <p>${t('otpCode.body', locale, 'emails')}</p>
        <div style="background-color: #f5f5f5; padding: 30px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #666;">${t('otpCode.codeLabel', locale, 'emails')}</p>
          <p style="margin: 10px 0; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #FF3E9A;">${code}</p>
        </div>
        <div style="background-color: #FEF3C7; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0;"><strong>${t('otpCode.expiry', locale, 'emails')}</strong></p>
        </div>
        <p style="color: #666; font-size: 14px;">
          ${t('otpCode.ignore', locale, 'emails')}
        </p>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          - ${t('common.team', locale, 'emails')}
        </p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }
}
