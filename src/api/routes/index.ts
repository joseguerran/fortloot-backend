
import { Router } from 'express';
import { orderRoutes } from './orderRoutes';
import { botRoutes } from './botRoutes';
import { analyticsRoutes } from './analyticsRoutes';
import { monitoringRoutes } from './monitoringRoutes';
import { authRoutes } from './authRoutes';
import { userRoutes } from './userRoutes';
import { customerRoutes } from './customerRoutes';
import { catalogRoutes } from './catalogRoutes';
import { pricingRoutes } from './pricingRoutes';
import { paymentRoutes } from './paymentRoutes';
import { paymentMethodRoutes } from './paymentMethodRoutes';
import { exchangeRateRoutes } from './exchangeRateRoutes';
import { kpiRoutes } from './kpiRoutes';
import { configRoutes } from './configRoutes';
import { otpRoutes } from './otpRoutes';
import { consentRoutes } from './consentRoutes';
import { announcementRoutes } from './announcementRoutes';
import { cryptoPaymentRoutes } from './cryptoPaymentRoutes';
import { webhookRoutes } from './webhookRoutes';
import logRoutes from './logs';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public health check endpoint (no auth)
router.get('/public-health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      authenticated: false,
      message: 'Fortloot Bot API public health',
      timestamp: new Date(),
    },
  });
});

// Health check endpoint with authentication (for admin panel login)
router.get('/health', authenticate, (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      authenticated: true,
      message: 'Fortloot Bot API is running',
      timestamp: new Date(),
    },
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/orders', orderRoutes);
router.use('/bots', botRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/customers', customerRoutes);
router.use('/catalog', catalogRoutes);
router.use('/pricing', pricingRoutes);
router.use('/payments', paymentRoutes);
router.use('/payment-methods', paymentMethodRoutes);
router.use('/exchange-rates', exchangeRateRoutes);
router.use('/kpis', kpiRoutes);
router.use('/config', configRoutes);
router.use('/logs', logRoutes);
router.use('/otp', otpRoutes);
router.use('/consent', consentRoutes);
router.use('/announcements', announcementRoutes);
router.use('/crypto', cryptoPaymentRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
