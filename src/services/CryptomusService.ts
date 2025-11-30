import crypto from 'crypto';
import { prisma } from '../database/client';
import { log } from '../utils/logger';
import { CryptoPaymentStatus } from '@prisma/client';

const CRYPTOMUS_API_URL = 'https://api.cryptomus.com/v1';

interface CreateInvoiceResponse {
  uuid: string;
  paymentUrl: string;
  expiresAt: Date;
}

interface CryptomusPaymentResult {
  uuid: string;
  order_id: string;
  amount: string;
  payment_amount: string;
  payer_amount: string;
  discount_percent: number;
  discount: string;
  payer_currency: string;
  currency: string;
  comments: string | null;
  merchant_amount: string;
  network: string;
  address: string;
  from: string | null;
  txid: string | null;
  payment_status: string;
  url: string;
  expired_at: number;
  status: string;
  is_final: boolean;
  additional_data: string | null;
}

interface CryptomusWebhookPayload {
  type: string;
  uuid: string;
  order_id: string;
  amount: string;
  payment_amount: string;
  payment_amount_usd: string;
  merchant_amount: string;
  commission: string;
  is_final: boolean;
  status: string;
  from: string | null;
  wallet_address_uuid: string | null;
  network: string | null;
  currency: string;
  payer_currency: string;
  additional_data: string | null;
  txid: string | null;
  sign: string;
}

interface CryptomusApiResponse {
  state: number;
  result?: CryptomusPaymentResult;
  message?: string;
}

export class CryptomusService {
  private static merchantId: string | null = null;
  private static apiKey: string | null = null;

  /**
   * Initialize service with credentials
   */
  private static getCredentials(): { merchantId: string; apiKey: string } | null {
    if (!this.merchantId || !this.apiKey) {
      this.merchantId = process.env.CRYPTOMUS_MERCHANT_ID || null;
      this.apiKey = process.env.CRYPTOMUS_API_KEY || null;

      if (!this.merchantId || !this.apiKey) {
        log.warn('Cryptomus credentials not configured (CRYPTOMUS_MERCHANT_ID, CRYPTOMUS_API_KEY)');
        return null;
      }
    }

    return { merchantId: this.merchantId, apiKey: this.apiKey };
  }

  /**
   * Generate MD5 signature for Cryptomus API requests
   */
  private static generateSign(payload: object, apiKey: string): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
    return crypto.createHash('md5').update(encoded + apiKey).digest('hex');
  }

  /**
   * Verify webhook signature from Cryptomus
   */
  static verifyWebhookSignature(body: CryptomusWebhookPayload): boolean {
    const credentials = this.getCredentials();
    if (!credentials) return false;

    const { sign, ...dataWithoutSign } = body;
    const encoded = Buffer.from(JSON.stringify(dataWithoutSign)).toString('base64');
    const expectedSign = crypto.createHash('md5').update(encoded + credentials.apiKey).digest('hex');

    return sign === expectedSign;
  }

  /**
   * Create a payment invoice in Cryptomus
   */
  static async createInvoice(
    orderId: string,
    amount: number,
    orderNumber: string
  ): Promise<CreateInvoiceResponse> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error('Cryptomus not configured');
    }

    const webhookUrl = process.env.CRYPTOMUS_WEBHOOK_URL || `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/webhooks/cryptomus`;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const payload = {
      amount: amount.toFixed(2),
      currency: 'USD',
      order_id: orderId,
      url_callback: webhookUrl,
      url_success: `${frontendUrl}/order-status/${orderNumber}?payment=success`,
      url_return: `${frontendUrl}/order-status/${orderNumber}`,
      lifetime: 3600, // 1 hour
      currencies: ['USDT', 'USDC'], // Only stablecoins
    };

    const sign = this.generateSign(payload, credentials.apiKey);

    log.info(`Creating Cryptomus invoice for order ${orderNumber} (${orderId}), amount: $${amount}`);

    const response = await fetch(`${CRYPTOMUS_API_URL}/payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'merchant': credentials.merchantId,
        'sign': sign,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as CryptomusApiResponse;

    if (data.state !== 0) {
      log.error('Cryptomus API error:', data);
      throw new Error(`Cryptomus error: ${data.message || 'Unknown error'}`);
    }

    const result = data.result as CryptomusPaymentResult;

    log.info(`Cryptomus invoice created: ${result.uuid} for order ${orderNumber}`);

    return {
      uuid: result.uuid,
      paymentUrl: result.url,
      expiresAt: new Date(result.expired_at * 1000),
    };
  }

  /**
   * Get payment status from Cryptomus
   */
  static async getPaymentStatus(uuid: string): Promise<CryptomusPaymentResult | null> {
    const credentials = this.getCredentials();
    if (!credentials) {
      return null;
    }

    const payload = { uuid };
    const sign = this.generateSign(payload, credentials.apiKey);

    const response = await fetch(`${CRYPTOMUS_API_URL}/payment/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'merchant': credentials.merchantId,
        'sign': sign,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as CryptomusApiResponse;

    if (data.state !== 0) {
      log.error('Cryptomus get status error:', data);
      return null;
    }

    return data.result || null;
  }

  /**
   * Create CryptoPayment record and invoice for an order
   */
  static async createPaymentForOrder(orderId: string): Promise<{
    cryptoPayment: any;
    paymentUrl: string;
  }> {
    // Get order details
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, finalPrice: true, status: true },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Check if order already has a crypto payment
    const existingPayment = await prisma.cryptoPayment.findUnique({
      where: { orderId },
    });

    if (existingPayment) {
      // If existing payment is still valid, return it
      if (existingPayment.status === 'PENDING' && existingPayment.expiresAt > new Date()) {
        return {
          cryptoPayment: existingPayment,
          paymentUrl: existingPayment.paymentUrl,
        };
      }

      // If expired, create a new one
      if (existingPayment.status === 'EXPIRED' || existingPayment.expiresAt <= new Date()) {
        await prisma.cryptoPayment.delete({ where: { id: existingPayment.id } });
      } else {
        // Payment in another status, can't create new one
        throw new Error(`Order already has a crypto payment in status: ${existingPayment.status}`);
      }
    }

    // Create invoice in Cryptomus
    const invoice = await this.createInvoice(orderId, order.finalPrice, order.orderNumber);

    // Create CryptoPayment record
    const cryptoPayment = await prisma.cryptoPayment.create({
      data: {
        orderId,
        cryptomusUuid: invoice.uuid,
        amount: order.finalPrice,
        status: 'PENDING',
        paymentUrl: invoice.paymentUrl,
        expiresAt: invoice.expiresAt,
      },
    });

    // Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentMethod: 'CRYPTO',
        currentStep: 'Esperando pago crypto...',
      },
    });

    log.info(`CryptoPayment created: ${cryptoPayment.id} for order ${order.orderNumber}`);

    return {
      cryptoPayment,
      paymentUrl: invoice.paymentUrl,
    };
  }

  /**
   * Map Cryptomus status to our CryptoPaymentStatus enum
   */
  static mapCryptomusStatus(status: string): CryptoPaymentStatus {
    const statusMap: Record<string, CryptoPaymentStatus> = {
      'process': 'PENDING',
      'check': 'PENDING',
      'confirm_check': 'CONFIRMING',
      'paid': 'PAID',
      'paid_over': 'PAID_OVER',
      'wrong_amount': 'WRONG_AMOUNT',
      'wrong_amount_waiting': 'WRONG_AMOUNT',
      'cancel': 'CANCELLED',
      'fail': 'FAILED',
      'system_fail': 'FAILED',
      'refund_process': 'CANCELLED',
      'refund_fail': 'FAILED',
      'refund_paid': 'CANCELLED',
    };

    return statusMap[status] || 'PENDING';
  }

  /**
   * Process webhook callback from Cryptomus
   */
  static async processWebhook(payload: CryptomusWebhookPayload): Promise<{
    success: boolean;
    message: string;
    shouldProcessOrder: boolean;
  }> {
    const { uuid, order_id, status, txid, payment_amount, currency, network } = payload;

    // Find the crypto payment
    const cryptoPayment = await prisma.cryptoPayment.findUnique({
      where: { cryptomusUuid: uuid },
      include: { order: true },
    });

    if (!cryptoPayment) {
      log.warn(`CryptoPayment not found for uuid: ${uuid}`);
      return { success: false, message: 'Payment not found', shouldProcessOrder: false };
    }

    const newStatus = this.mapCryptomusStatus(status);
    const isPaid = ['paid', 'paid_over'].includes(status);

    // Update CryptoPayment
    await prisma.cryptoPayment.update({
      where: { id: cryptoPayment.id },
      data: {
        status: newStatus,
        txHash: txid || cryptoPayment.txHash,
        paidAmount: payment_amount ? parseFloat(payment_amount) : cryptoPayment.paidAmount,
        cryptoCurrency: currency || cryptoPayment.cryptoCurrency,
        network: network || cryptoPayment.network,
        paidAt: isPaid ? new Date() : cryptoPayment.paidAt,
      },
    });

    log.info(`CryptoPayment ${cryptoPayment.id} updated: status=${newStatus}, txid=${txid || 'none'}`);

    return {
      success: true,
      message: `Payment updated to ${newStatus}`,
      shouldProcessOrder: isPaid,
    };
  }

  /**
   * Get crypto payment by order ID
   */
  static async getByOrderId(orderId: string) {
    return prisma.cryptoPayment.findUnique({
      where: { orderId },
    });
  }

  /**
   * Get all crypto payments (for admin view)
   */
  static async getAll(options: {
    status?: CryptoPaymentStatus;
    limit?: number;
    offset?: number;
  } = {}) {
    const { status, limit = 50, offset = 0 } = options;

    const where = status ? { status } : {};

    const [payments, total] = await Promise.all([
      prisma.cryptoPayment.findMany({
        where,
        include: {
          order: {
            select: {
              orderNumber: true,
              customer: {
                select: {
                  displayName: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.cryptoPayment.count({ where }),
    ]);

    return { payments, total };
  }

  /**
   * Check if Cryptomus is configured
   */
  static isConfigured(): boolean {
    return !!(process.env.CRYPTOMUS_MERCHANT_ID && process.env.CRYPTOMUS_API_KEY);
  }
}
