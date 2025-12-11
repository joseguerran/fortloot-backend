import { log } from '../utils/logger';

export type Locale = 'es' | 'en';
export type TranslationNamespace = 'emails' | 'whatsapp' | 'otp' | 'orders' | 'validation' | 'errors';

// Cache for loaded translations
const translationsCache: Map<string, Record<string, any>> = new Map();

/**
 * Load translations for a specific locale and namespace
 */
function loadTranslations(locale: Locale, namespace: TranslationNamespace): Record<string, any> {
  const key = `${locale}:${namespace}`;

  if (translationsCache.has(key)) {
    return translationsCache.get(key)!;
  }

  try {
    // Use require for synchronous loading
    const data = require(`../locales/${locale}/${namespace}.json`);
    translationsCache.set(key, data);
    return data;
  } catch (error) {
    log.error(`Failed to load translations for ${key}`, error);

    // Fallback to Spanish if English fails
    if (locale !== 'es') {
      try {
        const fallbackData = require(`../locales/es/${namespace}.json`);
        translationsCache.set(key, fallbackData);
        return fallbackData;
      } catch {
        log.error(`Failed to load fallback translations for es:${namespace}`);
      }
    }

    return {};
  }
}

/**
 * Get nested value from object using dot notation
 * e.g., getNestedValue(obj, 'paymentVerified.title')
 */
function getNestedValue(obj: Record<string, any>, path: string): string | undefined {
  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Translate a key with optional parameter interpolation
 *
 * @param key - Translation key using dot notation (e.g., 'paymentVerified.title')
 * @param locale - Target locale ('es' | 'en')
 * @param namespace - Translation namespace ('emails' | 'whatsapp' | etc.)
 * @param params - Optional parameters for interpolation (e.g., { orderNumber: 'FL-123' })
 * @returns Translated string or the key itself if not found
 *
 * @example
 * t('paymentVerified.subject', 'en', 'emails', { orderNumber: 'FL-123' })
 * // Returns: "Payment Verified - Order FL-123"
 */
export function t(
  key: string,
  locale: Locale = 'es',
  namespace: TranslationNamespace = 'emails',
  params?: Record<string, string | number>
): string {
  const translations = loadTranslations(locale, namespace);
  let text = getNestedValue(translations, key);

  if (!text) {
    // Try fallback to Spanish
    if (locale !== 'es') {
      const fallbackTranslations = loadTranslations('es', namespace);
      text = getNestedValue(fallbackTranslations, key);
    }

    // If still not found, return the key
    if (!text) {
      log.warn(`Translation not found: ${locale}:${namespace}:${key}`);
      return key;
    }
  }

  // Interpolate parameters
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text!.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(value));
    });
  }

  return text;
}


/**
 * Determine locale from Accept-Language header
 */
export function getLocaleFromHeader(acceptLanguage: string | undefined): Locale {
  if (!acceptLanguage) return 'es';

  // Simple parsing - check if English is preferred
  if (acceptLanguage.toLowerCase().startsWith('en')) {
    return 'en';
  }

  return 'es';
}

/**
 * Clear translation cache (useful for hot reloading in development)
 */
export function clearTranslationCache(): void {
  translationsCache.clear();
}

// Export singleton-like functions
export const LocalizationService = {
  t,
  getLocaleFromHeader,
  clearTranslationCache
};

export default LocalizationService;
