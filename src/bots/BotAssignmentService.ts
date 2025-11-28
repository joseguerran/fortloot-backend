import { prisma } from '../database/client';
import { Bot, Order, Customer } from '@prisma/client';
import { log } from '../utils/logger';
import { botManager } from './BotManager';
import { calculateGiftsToday } from '../utils/helpers';
import { NotificationService } from '../services/NotificationService';

// Order type with customer relation included
type OrderWithCustomer = Order & { customer?: Customer | null };

/**
 * Servicio de asignación inteligente de bots a órdenes
 * Usa lógica simple con criterios binarios (sin health scores ambiguos)
 */
export class BotAssignmentService {
  /**
   * Asigna el mejor bot para una orden
   * Lógica SIMPLE: Primero que cumpla todos los requisitos
   */
  static async assignBotToOrder(order: OrderWithCustomer): Promise<BotAssignment> {
    log.info(`🤖 Buscando bot para orden ${order.id}`);

    // 1. Calcular requisitos de la orden
    const requirements = await this.calculateOrderRequirements(order);
    log.info(`📊 Requisitos: ${requirements.giftsNeeded} gifts, ${requirements.vBucksNeeded} V-Bucks`);

    // 2. Obtener TODOS los bots activos
    const allBots = await prisma.bot.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' }, // FIFO: primer bot agregado tiene prioridad
    });

    log.info(`🔍 Evaluando ${allBots.length} bots activos`);

    // 3. FILTRAR bots elegibles (criterios binarios)
    const eligibleBots = [];

    for (const bot of allBots) {
      // Criterio 1: ¿Está ONLINE?
      if (bot.status !== 'ONLINE') {
        log.debug(`❌ Bot ${bot.displayName}: OFFLINE (status: ${bot.status})`);
        continue; // SKIP - ni siquiera evaluar más
      }

      // Criterio 2: ¿Tiene pavos suficientes?
      if (bot.vBucks < requirements.vBucksNeeded) {
        log.debug(`❌ Bot ${bot.displayName}: Insuficientes V-Bucks (tiene: ${bot.vBucks}, necesita: ${requirements.vBucksNeeded})`);
        continue; // SKIP - no sirve
      }

      // Criterio 3: ¿Tiene gifts disponibles?
      const giftsToday = await calculateGiftsToday(bot.id);
      const giftsAvailable = bot.maxGiftsPerDay - giftsToday;

      if (giftsAvailable < requirements.giftsNeeded) {
        log.debug(`❌ Bot ${bot.displayName}: Sin gifts disponibles (disponibles: ${giftsAvailable}, necesita: ${requirements.giftsNeeded})`);
        continue; // SKIP - no tiene capacidad
      }

      // ✅ Bot cumple TODOS los criterios
      log.info(`✅ Bot ${bot.displayName} ELEGIBLE (V-Bucks: ${bot.vBucks}, Gifts: ${giftsAvailable}/${bot.maxGiftsPerDay})`);
      eligibleBots.push(bot);
    }

    // 4. ¿Encontramos bot elegible?
    if (eligibleBots.length > 0) {
      const selectedBot = eligibleBots[0]; // Primer bot que cumple (FIFO)

      log.info(`🎯 Bot ${selectedBot.displayName} ASIGNADO a orden ${order.id}`);

      // Verificar si el bot está bajo de V-Bucks (tiene suficiente pero menos del recomendado)
      if (selectedBot.vBucks < requirements.vBucksRecommended) {
        const vBucksShortage = requirements.vBucksRecommended - selectedBot.vBucks;
        log.warn(`⚠️ Bot ${selectedBot.displayName} tiene V-Bucks justos. Recomendado recargar ${vBucksShortage} V-Bucks`);

        // Notificar admin que el bot está bajo de V-Bucks
        await NotificationService.notifyAdminWarning({
          type: 'BOT_LOW_VBUCKS',
          botId: selectedBot.id,
          botName: selectedBot.displayName,
          currentVBucks: selectedBot.vBucks,
          recommendedVBucks: requirements.vBucksRecommended,
          message: `Bot ${selectedBot.displayName} puede procesar la orden pero está bajo de V-Bucks (${selectedBot.vBucks}/${requirements.vBucksRecommended}). Recargar pronto.`,
        });
      }

      return {
        status: 'ASSIGNED',
        botId: selectedBot.id,
        botName: selectedBot.displayName,
      };
    }

    // 5. NO hay bots elegibles → ESTRATEGIA DE RECUPERACIÓN
    log.warn(`⚠️ No hay bots elegibles para orden ${order.id}, ejecutando estrategia de recuperación`);
    return await this.handleNoBotAvailable(allBots, requirements, order);
  }

  /**
   * Estrategia cuando NO hay bot disponible
   */
  private static async handleNoBotAvailable(
    allBots: Bot[],
    requirements: OrderRequirements,
    order: OrderWithCustomer
  ): Promise<BotAssignment> {
    // Clasificar bots por problema
    const offlineBots = allBots.filter((b) => b.status === 'OFFLINE' || b.status === 'ERROR');

    const onlineBots = allBots.filter((b) => b.status === 'ONLINE');

    const lowVBucksBots = [];
    const noGiftsBots = [];

    for (const bot of onlineBots) {
      if (bot.vBucks < requirements.vBucksNeeded) {
        lowVBucksBots.push(bot);
      } else {
        const giftsToday = await calculateGiftsToday(bot.id);
        const giftsAvailable = bot.maxGiftsPerDay - giftsToday;

        if (giftsAvailable < requirements.giftsNeeded) {
          noGiftsBots.push(bot);
        }
      }
    }

    log.info(`📊 Diagnóstico: ${offlineBots.length} offline, ${lowVBucksBots.length} sin pavos, ${noGiftsBots.length} sin gifts`);

    // ESTRATEGIA 1: ¿Hay bots offline que podemos reiniciar?
    if (offlineBots.length > 0) {
      log.info(`🔄 Intentando reiniciar ${offlineBots.length} bots offline`);
      const restarted = await this.tryRestartBots(offlineBots);

      if (restarted.length > 0) {
        // Esperar 10 segundos a que bot inicie
        log.info(`⏳ Esperando 10s a que ${restarted.length} bot(s) inicien...`);
        await this.sleep(10000);

        // Reintentar asignación (recursivo)
        log.info(`🔁 Reintentando asignación después de restart`);
        return await this.assignBotToOrder(order);
      }

      // No se pudo reiniciar → Reencolar para más tarde
      log.warn(`⚠️ No se pudo reiniciar ningún bot, reencolando`);
      return {
        status: 'REQUEUE',
        reason: 'Bots offline - reintentando restart',
        retryAfter: 60000, // 1 minuto
      };
    }

    // ESTRATEGIA 2: ¿Todos online pero sin V-Bucks?
    if (lowVBucksBots.length === allBots.length) {
      // TODOS los bots sin pavos
      log.error(`🚨 CRÍTICO: TODOS los bots sin V-Bucks`);

      await NotificationService.notifyAdminCritical({
        type: 'ALL_BOTS_NO_VBUCKS',
        message: `🚨 TODOS los bots sin V-Bucks. Orden ${order.id} bloqueada.`,
        orderId: order.id,
        requiredVBucks: requirements.vBucksNeeded,
      });

      return {
        status: 'WAITING_MANUAL_ACTION',
        reason: 'Todos los bots sin V-Bucks - requiere recarga',
        action: 'LOAD_VBUCKS',
        notificationSent: true,
      };
    }

    // ESTRATEGIA 3: ¿Todos sin gifts disponibles?
    if (noGiftsBots.length === onlineBots.length && onlineBots.length > 0) {
      // Calcular cuándo se resetea el primer bot
      const nextReset = await this.calculateNextGiftReset(allBots);
      const waitTime = nextReset.getTime() - Date.now();

      log.warn(`⏰ Todos los bots sin gifts, próximo reset en ${Math.round(waitTime / 1000 / 60)} minutos`);

      // Notificar cliente sobre demanda alta
      // Use customer relation for email
      await NotificationService.notifyCustomerDelay({
        orderId: order.id,
        customerEmail: order.customer?.email || '',
        reason: 'high_demand',
        estimatedDelayMinutes: Math.ceil(waitTime / 1000 / 60),
      });

      return {
        status: 'REQUEUE',
        reason: 'Todos los bots sin gifts - esperando reset diario',
        retryAfter: waitTime,
      };
    }

    // ESTRATEGIA 4: Mix de problemas (algunos offline, algunos sin pavos)
    log.info(`🔧 Mix de problemas detectados, aplicando estrategias múltiples`);

    // Priorizar: reiniciar offline primero
    if (offlineBots.length > 0) {
      await this.tryRestartBots(offlineBots);
    }

    // Notificar sobre bots sin pavos si los hay
    if (lowVBucksBots.length > 0) {
      await NotificationService.notifyAdminWarning({
        type: 'SOME_BOTS_NO_VBUCKS',
        botsAffected: lowVBucksBots.map((b) => b.displayName),
        ordersBlocked: 1,
      });
    }

    // Reencolar para reintentar en 2 minutos
    return {
      status: 'REQUEUE',
      reason: 'Esperando disponibilidad de bots',
      retryAfter: 120000, // 2 minutos
    };
  }

  /**
   * Intenta reiniciar bots offline
   */
  private static async tryRestartBots(bots: Bot[]): Promise<Bot[]> {
    const restarted = [];

    for (const bot of bots) {
      try {
        log.info(`🔄 Intentando restart automático de bot ${bot.displayName}`);
        await botManager.loginBot(bot.id);
        restarted.push(bot);
        log.info(`✅ Bot ${bot.displayName} reiniciado exitosamente`);
      } catch (error: any) {
        log.error(`❌ No se pudo reiniciar bot ${bot.displayName}: ${error.message}`);

        // Si falla por credenciales
        if (error.code === 'BOT_AUTH_FAILED') {
          await NotificationService.notifyAdminCritical({
            type: 'BOT_AUTH_EXPIRED',
            botId: bot.id,
            botName: bot.displayName,
            message: 'Credenciales expiradas - requiere actualización manual',
          });
        }
      }
    }

    return restarted;
  }

  /**
   * Calcula cuándo el primer bot tendrá gifts disponibles
   */
  private static async calculateNextGiftReset(bots: Bot[]): Promise<Date> {
    const resetTimes = [];

    for (const bot of bots) {
      // Buscar el gift más antiguo de hoy
      const oldestGiftToday = await prisma.gift.findFirst({
        where: {
          botId: bot.id,
          status: 'SENT',
          sentAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { sentAt: 'asc' },
      });

      if (oldestGiftToday) {
        // 24 horas después del primer gift es cuando se libera
        const resetTime = new Date(oldestGiftToday.sentAt.getTime() + 24 * 60 * 60 * 1000);
        resetTimes.push(resetTime);
      }
    }

    // Retornar el reset más próximo
    return resetTimes.length > 0
      ? new Date(Math.min(...resetTimes.map((d) => d.getTime())))
      : new Date(Date.now() + 24 * 60 * 60 * 1000); // Default: 24h
  }

  /**
   * Calcula requisitos de una orden
   */
  private static async calculateOrderRequirements(order: Order): Promise<OrderRequirements> {
    const items = await prisma.orderItem.findMany({
      where: { orderId: order.id },
      include: {
        catalogItem: {
          select: { baseVbucks: true }
        }
      }
    });

    if (items.length === 0) {
      throw new Error(`Order ${order.id} has no items`);
    }

    // Calcular V-Bucks totales necesarios desde los precios reales de los items
    const totalVBucks = items.reduce((sum, item) => {
      // Obtener precio en V-Bucks del catálogo
      const itemVBucks = item.catalogItem?.baseVbucks || 0;
      return sum + (itemVBucks * item.quantity);
    }, 0);

    log.info(`📊 V-Bucks necesarios para orden ${order.id}: ${totalVBucks} V-Bucks (sin buffer)`);

    return {
      vBucksNeeded: totalVBucks, // SIN BUFFER - comparar con precio exacto
      vBucksRecommended: totalVBucks + 200, // Buffer recomendado para notificaciones
      giftsNeeded: items.length,
    };
  }

  /**
   * Utilidad: sleep
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Tipos
export interface BotAssignment {
  status: 'ASSIGNED' | 'REQUEUE' | 'WAITING_MANUAL_ACTION';
  botId?: string;
  botName?: string;
  reason?: string;
  retryAfter?: number; // milisegundos
  action?: 'LOAD_VBUCKS' | 'FIX_AUTH';
  notificationSent?: boolean;
}

interface OrderRequirements {
  vBucksNeeded: number; // V-Bucks mínimos requeridos (precio exacto del item)
  vBucksRecommended: number; // V-Bucks recomendados (con buffer de seguridad)
  giftsNeeded: number;
}
