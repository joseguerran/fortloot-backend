/**
 * Consent Routes - GDPR Consent Recording
 * Registra consentimientos de cookies para evidencia legal
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../../database/client';
import { createHash } from 'crypto';

const router = Router();

interface ConsentBody {
  sessionId: string;
  consent: {
    necessary: boolean;
    preferences: boolean;
    analytics: boolean;
    marketing: boolean;
  };
  policyVersion: string;
  customerId?: string;
}

/**
 * Hash IP address for GDPR compliance
 * No guardamos IP real, solo hash para identificación
 */
function hashIP(ip: string): string {
  return createHash('sha256').update(ip + process.env.ENCRYPTION_KEY).digest('hex').substring(0, 32);
}

/**
 * POST /api/consent
 * Registra un nuevo consentimiento de cookies
 * Este endpoint es público (no requiere autenticación)
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sessionId, consent, policyVersion, customerId } = req.body as ConsentBody;

    // Validar campos requeridos
    if (!sessionId || !consent || !policyVersion) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, consent, policyVersion',
      });
    }

    // Obtener y hashear IP
    const clientIP = req.headers['x-forwarded-for']?.toString().split(',')[0] ||
                     req.socket.remoteAddress ||
                     'unknown';
    const ipHash = hashIP(clientIP);

    // Obtener User-Agent
    const userAgent = req.headers['user-agent'] || null;

    // Verificar si el customer existe (si se proporciona customerId)
    let validCustomerId: string | null = null;
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (customer) {
        validCustomerId = customer.id;
      }
    }

    // Crear o actualizar registro de consentimiento
    // Usamos upsert basado en sessionId para evitar duplicados
    const existingRecord = await prisma.consentRecord.findFirst({
      where: { sessionId },
      orderBy: { consentedAt: 'desc' },
    });

    let consentRecord;
    if (existingRecord) {
      // Actualizar registro existente
      consentRecord = await prisma.consentRecord.update({
        where: { id: existingRecord.id },
        data: {
          necessary: consent.necessary ?? true,
          preferences: consent.preferences ?? false,
          analytics: consent.analytics ?? false,
          marketing: consent.marketing ?? false,
          ipHash,
          userAgent,
          policyVersion,
          customerId: validCustomerId,
        },
      });
    } else {
      // Crear nuevo registro
      consentRecord = await prisma.consentRecord.create({
        data: {
          sessionId,
          necessary: consent.necessary ?? true,
          preferences: consent.preferences ?? false,
          analytics: consent.analytics ?? false,
          marketing: consent.marketing ?? false,
          ipHash,
          userAgent,
          policyVersion,
          customerId: validCustomerId,
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: {
        id: consentRecord.id,
        consentedAt: consentRecord.consentedAt,
      },
    });
  } catch (error) {
    console.error('Error recording consent:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to record consent',
    });
  }
});

/**
 * GET /api/consent/:sessionId
 * Obtiene el último consentimiento de una sesión
 * Útil para sincronizar estado entre pestañas/dispositivos
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const consentRecord = await prisma.consentRecord.findFirst({
      where: { sessionId },
      orderBy: { consentedAt: 'desc' },
      select: {
        id: true,
        necessary: true,
        preferences: true,
        analytics: true,
        marketing: true,
        policyVersion: true,
        consentedAt: true,
      },
    });

    if (!consentRecord) {
      return res.status(404).json({
        success: false,
        error: 'No consent record found for this session',
      });
    }

    return res.json({
      success: true,
      data: consentRecord,
    });
  } catch (error) {
    console.error('Error fetching consent:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch consent',
    });
  }
});

export { router as consentRoutes };
