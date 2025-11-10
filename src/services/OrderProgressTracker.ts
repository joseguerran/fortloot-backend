import { prisma } from '../database/client';
import { log } from '../utils/logger';

/**
 * Servicio para trackear el progreso de órdenes con pasos detallados
 * Almacena timeline de eventos en order.progressSteps (JSON field)
 */
export class OrderProgressTracker {
  /**
   * Actualiza el progreso de una orden agregando un nuevo paso
   */
  static async update(
    orderId: string,
    step: ProgressStep,
    details?: string,
    metadata?: any
  ): Promise<void> {
    try {
      // Obtener orden actual
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { progressSteps: true },
      });

      if (!order) {
        log.error(`Order ${orderId} not found for progress update`);
        return;
      }

      // Obtener pasos existentes o inicializar array vacío
      const existingSteps = (order.progressSteps as unknown as ProgressStepRecord[]) || [];

      // Crear nuevo paso
      const newStep: ProgressStepRecord = {
        step,
        timestamp: new Date().toISOString(),
        details,
        metadata,
      };

      // Agregar nuevo paso al array
      const updatedSteps = [...existingSteps, newStep];

      // Actualizar en base de datos
      await prisma.order.update({
        where: { id: orderId },
        data: {
          progressSteps: updatedSteps as any,
          currentStep: this.getStepDescription(step, details),
        },
      });

      log.info(`📊 Progress updated for order ${orderId}: ${step} - ${details || ''}`);
    } catch (error) {
      log.error(`Failed to update progress for order ${orderId}:`, error);
      // No lanzar error - el tracking no debe bloquear el proceso principal
    }
  }

  /**
   * Obtiene el resumen de progreso de una orden para mostrar en UI
   */
  static async getProgressSummary(orderId: string): Promise<ProgressSummary> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        progressSteps: true,
        currentStep: true,
        createdAt: true,
        completedAt: true,
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const steps = (order.progressSteps as unknown as ProgressStepRecord[]) || [];

    // Calcular progreso (1-5 pasos típicos)
    const totalSteps = 5;
    const currentStepNumber = this.calculateCurrentStepNumber(order.status, steps);
    const progressPercentage = Math.round((currentStepNumber / totalSteps) * 100);

    // Determinar pasos completados vs pendientes
    const completedSteps = steps.map((s) => ({
      step: s.step,
      details: s.details || this.getStepDescription(s.step),
      timestamp: s.timestamp,
      metadata: s.metadata,
    }));

    const pendingSteps = this.getPendingSteps(order.status);

    return {
      orderId: order.id,
      status: order.status,
      currentStep: order.currentStep || 'Procesando...',
      currentStepNumber,
      totalSteps,
      progressPercentage,
      completedSteps,
      pendingSteps,
      estimatedCompletion: this.estimateCompletion(order.createdAt, steps),
    };
  }

  /**
   * Obtiene descripción amigable de un paso
   */
  private static getStepDescription(step: ProgressStep, customDetails?: string): string {
    if (customDetails) return customDetails;

    const descriptions: Record<ProgressStep, string> = {
      CREATED: 'Orden creada',
      PAYMENT_PENDING: 'Esperando pago',
      PAYMENT_VERIFIED: 'Pago verificado',
      QUEUED: 'En cola de procesamiento',
      BOT_ASSIGNED: 'Bot asignado',
      VALIDATING_FRIENDSHIP: 'Validando amistad',
      RESOLVING_ITEMS: 'Resolviendo items en catálogo',
      SENDING_GIFT: 'Enviando regalo',
      COMPLETED: 'Completado',
      WAITING_BOT: 'Esperando bot disponible',
      WAITING_VBUCKS: 'Esperando recarga de V-Bucks',
      BLOCKED: 'Bloqueado - requiere atención',
      FAILED: 'Falló',
      CANCELLED: 'Orden cancelada',
      RETRY_REQUESTED: 'Reintento solicitado',
      VBUCKS_LOADED: 'V-Bucks recargados',
      BOT_FIXED: 'Bot reparado',
      FRIENDSHIP_REQUESTED: 'Solicitud de amistad enviada',
      WAITING_PERIOD: 'Esperando período de amistad',
      GIFT_SENT: 'Regalo enviado',
      RETRY: 'Reintentando',
    };

    return descriptions[step] || step;
  }

  /**
   * Calcula el número de paso actual basado en status
   */
  private static calculateCurrentStepNumber(
    status: string,
    steps: ProgressStepRecord[]
  ): number {
    // Mapeo de status a número de paso (1-5)
    const statusToStep: Record<string, number> = {
      PENDING: 1,
      PENDING_PAYMENT: 1,
      PAYMENT_UPLOADED: 1,
      PAYMENT_VERIFIED: 2,
      QUEUED: 2,
      PROCESSING: 3,
      BOT_ASSIGNED: 3,
      WAITING_FRIENDSHIP: 3,
      WAITING_PERIOD: 3,
      SENDING_GIFT: 4,
      COMPLETED: 5,
      WAITING_BOT: 2,
      WAITING_VBUCKS: 2,
      WAITING_BOT_FIX: 2,
    };

    return statusToStep[status] || 1;
  }

  /**
   * Obtiene pasos pendientes según el status actual
   */
  private static getPendingSteps(status: string): string[] {
    const allSteps = [
      'Creación de orden',
      'Verificación de pago',
      'Asignación de bot',
      'Envío de regalo',
      'Completado',
    ];

    const statusToCompletedIndex: Record<string, number> = {
      PENDING: 0,
      PENDING_PAYMENT: 0,
      PAYMENT_UPLOADED: 1,
      PAYMENT_VERIFIED: 1,
      QUEUED: 2,
      PROCESSING: 2,
      SENDING_GIFT: 3,
      COMPLETED: 5,
    };

    const completedIndex = statusToCompletedIndex[status] || 0;
    return allSteps.slice(completedIndex + 1);
  }

  /**
   * Estima tiempo de completación basado en pasos completados
   */
  private static estimateCompletion(
    createdAt: Date,
    steps: ProgressStepRecord[]
  ): Date | null {
    if (steps.length === 0) {
      // Si no hay pasos, estimar 2 horas desde creación
      return new Date(createdAt.getTime() + 2 * 60 * 60 * 1000);
    }

    const lastStep = steps[steps.length - 1];
    const lastTimestamp = new Date(lastStep.timestamp);

    // Estimar según el último paso
    if (lastStep.step === 'WAITING_BOT' || lastStep.step === 'WAITING_VBUCKS') {
      // Si está esperando, estimar 24 horas
      return new Date(lastTimestamp.getTime() + 24 * 60 * 60 * 1000);
    }

    if (lastStep.step === 'BOT_ASSIGNED') {
      // Si ya tiene bot, estimar 30 minutos
      return new Date(lastTimestamp.getTime() + 30 * 60 * 1000);
    }

    if (lastStep.step === 'SENDING_GIFT') {
      // Si está enviando, estimar 5 minutos
      return new Date(lastTimestamp.getTime() + 5 * 60 * 1000);
    }

    // Default: 1 hora desde último paso
    return new Date(lastTimestamp.getTime() + 60 * 60 * 1000);
  }
}

// Tipos
export type ProgressStep =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_VERIFIED'
  | 'QUEUED'
  | 'BOT_ASSIGNED'
  | 'VALIDATING_FRIENDSHIP'
  | 'RESOLVING_ITEMS'
  | 'SENDING_GIFT'
  | 'COMPLETED'
  | 'WAITING_BOT'
  | 'WAITING_VBUCKS'
  | 'BLOCKED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RETRY_REQUESTED'
  | 'VBUCKS_LOADED'
  | 'BOT_FIXED'
  | 'FRIENDSHIP_REQUESTED'
  | 'WAITING_PERIOD'
  | 'GIFT_SENT'
  | 'RETRY';

interface ProgressStepRecord {
  step: ProgressStep;
  timestamp: string;
  details?: string;
  metadata?: any;
}

interface ProgressSummary {
  orderId: string;
  status: string;
  currentStep: string;
  currentStepNumber: number;
  totalSteps: number;
  progressPercentage: number;
  completedSteps: Array<{
    step: ProgressStep;
    details: string;
    timestamp: string;
    metadata?: any;
  }>;
  pendingSteps: string[];
  estimatedCompletion: Date | null;
}
