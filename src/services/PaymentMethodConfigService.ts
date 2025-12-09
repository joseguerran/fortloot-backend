import { prisma } from '../database/client';
import { PaymentMethodConfig } from '@prisma/client';
import { log } from '../utils/logger';
import { ExchangeRateService } from './ExchangeRateService';

// Tipos de configuración soportados
export type PaymentMethodConfigType =
  | 'CURRENCY_CONVERSION'
  | 'FEE'
  | 'COUNTRY_RESTRICTION'
  | 'AMOUNT_LIMIT';

// Configuración de conversión de moneda
export interface CurrencyConversionConfig {
  targetCurrency: string; // "VES", "CLP", "COP", etc.
  rateProvider: 'binance_p2p' | 'manual' | string;
  bankFilter?: string; // "Mercantil", "Banesco", etc.
  markup: number; // Monto adicional en la moneda destino
  cacheTTLMin: number; // Tiempo de cache en minutos
}

// Configuración de comisión (soporta comisión compuesta: % + fijo)
export interface FeeConfig {
  feeType: 'PERCENTAGE' | 'FIXED' | 'COMPOUND';
  feeValue: number; // Porcentaje si es PERCENTAGE o COMPOUND
  fixedFee?: number; // Monto fijo adicional (usado en COMPOUND y FIXED)
  description?: string; // Descripción que ve el cliente (ej: "Comisión PayPal")
}

// Configuración de restricción de país
export interface CountryRestrictionConfig {
  countries: string[];
  mode: 'whitelist' | 'blacklist';
}

// Configuración de límite de monto
export interface AmountLimitConfig {
  minAmount?: number;
  maxAmount?: number;
}

// Resultado de aplicar configuraciones a un precio
export interface PriceResult {
  originalUsd: number;
  finalUsd: number;
  convertedAmount?: number;
  convertedCurrency?: string;
  validUntil?: Date;
  fees?: {
    type: string;
    amount: number;
    description?: string;
  }[];
}

export class PaymentMethodConfigService {
  /**
   * Obtener todas las configuraciones de un método de pago
   */
  static async getConfigs(paymentMethodId: string): Promise<PaymentMethodConfig[]> {
    try {
      const configs = await prisma.paymentMethodConfig.findMany({
        where: { paymentMethodId },
        orderBy: { type: 'asc' },
      });

      return configs;
    } catch (error) {
      log.error(`Error fetching configs for payment method ${paymentMethodId}:`, error);
      throw new Error('Failed to fetch payment method configs');
    }
  }

  /**
   * Obtener todas las configuraciones de un método de pago por slug
   */
  static async getConfigsBySlug(slug: string): Promise<PaymentMethodConfig[]> {
    try {
      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { slug },
        include: { configs: true },
      });

      if (!paymentMethod) {
        throw new Error(`Payment method with slug '${slug}' not found`);
      }

      return paymentMethod.configs;
    } catch (error) {
      log.error(`Error fetching configs for payment method slug ${slug}:`, error);
      throw error;
    }
  }

  /**
   * Obtener una configuración específica por tipo
   */
  static async getConfigByType(
    paymentMethodId: string,
    type: PaymentMethodConfigType
  ): Promise<PaymentMethodConfig | null> {
    try {
      const config = await prisma.paymentMethodConfig.findUnique({
        where: {
          paymentMethodId_type: {
            paymentMethodId,
            type,
          },
        },
      });

      return config;
    } catch (error) {
      log.error(`Error fetching ${type} config for payment method ${paymentMethodId}:`, error);
      throw new Error(`Failed to fetch ${type} config`);
    }
  }

  /**
   * Crear o actualizar una configuración (upsert)
   */
  static async upsertConfig(
    paymentMethodId: string,
    type: PaymentMethodConfigType,
    config: object,
    enabled: boolean = true
  ): Promise<PaymentMethodConfig> {
    try {
      // Verificar que el método de pago existe
      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { id: paymentMethodId },
      });

      if (!paymentMethod) {
        throw new Error(`Payment method with ID '${paymentMethodId}' not found`);
      }

      const result = await prisma.paymentMethodConfig.upsert({
        where: {
          paymentMethodId_type: {
            paymentMethodId,
            type,
          },
        },
        update: {
          config,
          enabled,
        },
        create: {
          paymentMethodId,
          type,
          config,
          enabled,
        },
      });

      log.info(`Payment method config upserted: ${paymentMethod.slug} - ${type}`);
      return result;
    } catch (error) {
      log.error(`Error upserting ${type} config for payment method ${paymentMethodId}:`, error);
      throw error;
    }
  }

  /**
   * Eliminar una configuración
   */
  static async deleteConfig(
    paymentMethodId: string,
    type: PaymentMethodConfigType
  ): Promise<void> {
    try {
      await prisma.paymentMethodConfig.delete({
        where: {
          paymentMethodId_type: {
            paymentMethodId,
            type,
          },
        },
      });

      log.info(`Payment method config deleted: ${paymentMethodId} - ${type}`);
    } catch (error) {
      log.error(`Error deleting ${type} config for payment method ${paymentMethodId}:`, error);
      throw new Error(`Failed to delete ${type} config`);
    }
  }

  /**
   * Habilitar/deshabilitar una configuración
   */
  static async toggleConfig(
    paymentMethodId: string,
    type: PaymentMethodConfigType,
    enabled: boolean
  ): Promise<PaymentMethodConfig> {
    try {
      const config = await prisma.paymentMethodConfig.update({
        where: {
          paymentMethodId_type: {
            paymentMethodId,
            type,
          },
        },
        data: { enabled },
      });

      log.info(`Payment method config toggled: ${paymentMethodId} - ${type} -> ${enabled}`);
      return config;
    } catch (error) {
      log.error(`Error toggling ${type} config for payment method ${paymentMethodId}:`, error);
      throw new Error(`Failed to toggle ${type} config`);
    }
  }

  /**
   * Aplicar todas las configuraciones a un precio y obtener el resultado final
   */
  static async applyConfigsToPrice(
    paymentMethodId: string,
    priceUsd: number
  ): Promise<PriceResult> {
    try {
      const configs = await this.getConfigs(paymentMethodId);
      const enabledConfigs = configs.filter((c) => c.enabled);

      const result: PriceResult = {
        originalUsd: priceUsd,
        finalUsd: priceUsd,
        fees: [],
      };

      for (const configRecord of enabledConfigs) {
        const configData = configRecord.config as object;

        switch (configRecord.type) {
          case 'CURRENCY_CONVERSION':
            await this.applyCurrencyConversion(result, configData as CurrencyConversionConfig);
            break;

          case 'FEE':
            this.applyFee(result, configData as FeeConfig);
            break;

          // Otros tipos se pueden agregar aquí en el futuro
          // case 'AMOUNT_LIMIT':
          // case 'COUNTRY_RESTRICTION':
        }
      }

      return result;
    } catch (error) {
      log.error(`Error applying configs for payment method ${paymentMethodId}:`, error);
      throw error;
    }
  }

  /**
   * Aplicar conversión de moneda
   */
  private static async applyCurrencyConversion(
    result: PriceResult,
    config: CurrencyConversionConfig
  ): Promise<void> {
    try {
      const rateResult = await ExchangeRateService.getRate(config.targetCurrency, config);

      if (rateResult) {
        result.convertedAmount = parseFloat((result.finalUsd * rateResult.rate).toFixed(2));
        result.convertedCurrency = config.targetCurrency;
        result.validUntil = rateResult.expiresAt;
      }
    } catch (error) {
      log.error(`Error applying currency conversion to ${config.targetCurrency}:`, error);
      // No lanzar error - la conversión es opcional si falla
    }
  }

  /**
   * Aplicar comisión (soporta PERCENTAGE, FIXED, o COMPOUND)
   */
  private static applyFee(result: PriceResult, config: FeeConfig): void {
    let feeAmount: number = 0;

    switch (config.feeType) {
      case 'PERCENTAGE':
        // Solo porcentaje
        feeAmount = parseFloat(((result.finalUsd * config.feeValue) / 100).toFixed(2));
        break;

      case 'FIXED':
        // Solo monto fijo
        feeAmount = config.fixedFee || config.feeValue;
        break;

      case 'COMPOUND':
        // Porcentaje + monto fijo (ej: PayPal 5.4% + $0.30)
        const percentagePart = parseFloat(((result.finalUsd * config.feeValue) / 100).toFixed(2));
        const fixedPart = config.fixedFee || 0;
        feeAmount = parseFloat((percentagePart + fixedPart).toFixed(2));
        break;

      default:
        feeAmount = config.feeValue;
    }

    result.finalUsd = parseFloat((result.finalUsd + feeAmount).toFixed(2));

    // Agregar como un solo item de comisión con la descripción personalizada
    result.fees?.push({
      type: config.feeType,
      amount: feeAmount,
      description: config.description,
    });

    // Si hay conversión, recalcular el monto convertido
    if (result.convertedAmount && result.convertedCurrency) {
      const ratio = result.finalUsd / result.originalUsd;
      result.convertedAmount = parseFloat((result.convertedAmount * ratio).toFixed(2));
    }
  }

  /**
   * Obtener método de pago con todas sus configuraciones
   */
  static async getPaymentMethodWithConfigs(paymentMethodId: string) {
    try {
      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { id: paymentMethodId },
        include: { configs: true },
      });

      return paymentMethod;
    } catch (error) {
      log.error(`Error fetching payment method with configs ${paymentMethodId}:`, error);
      throw new Error('Failed to fetch payment method with configs');
    }
  }

  /**
   * Obtener método de pago con configuraciones por slug
   */
  static async getPaymentMethodWithConfigsBySlug(slug: string) {
    try {
      const paymentMethod = await prisma.paymentMethod.findUnique({
        where: { slug },
        include: { configs: true },
      });

      return paymentMethod;
    } catch (error) {
      log.error(`Error fetching payment method with configs by slug ${slug}:`, error);
      throw new Error('Failed to fetch payment method with configs');
    }
  }
}
