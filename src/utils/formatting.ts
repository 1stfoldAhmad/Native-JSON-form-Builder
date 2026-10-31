import { I18nManager } from 'react-native';

import type { NumericFormatConfig } from '../types';

const RTL_LANG_PREFIXES = ['ar', 'ur', 'fa', 'he', 'ps', 'sd', 'ug', 'yi'];

export function isRTLLocale(locale?: string, explicitDirection?: string): boolean {
  if (explicitDirection === 'rtl') return true;
  if (explicitDirection === 'ltr') return false;
  if (locale) {
    const normalized = locale.toLowerCase().split(/[-_]/)[0];
    if (RTL_LANG_PREFIXES.includes(normalized)) return true;
  }
  return Boolean(I18nManager?.isRTL);
}

/**
 * Resolves a string or `{ en: '...', ur: '...' }` localized dictionary,
 * with optional key lookup in `config.i18n.translations`.
 */
export function resolveLocalizedText(
  value: string | Record<string, string> | undefined,
  locale = 'en',
  translations?: Record<string, Record<string, string>>
): string | undefined {
  if (value === undefined || value === null) return undefined;

  const shortLocale = locale.split(/[-_]/)[0];

  if (typeof value === 'string') {
    const dict = translations?.[locale] ?? translations?.[shortLocale];
    if (dict && Object.prototype.hasOwnProperty.call(dict, value)) {
      return dict[value];
    }
    return value;
  }

  if (typeof value === 'object') {
    return (
      value[locale] ??
      value[shortLocale] ??
      value.en ??
      Object.values(value)[0]
    );
  }

  return undefined;
}

export function formatNumberValue(
  value: number | null | undefined,
  format?: NumericFormatConfig,
  fallbackLocale = 'en-US'
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  const locale = format?.locale ?? fallbackLocale;
  const precision = format?.precision;

  let formatted: string;
  try {
    if (format?.currencyCode) {
      formatted = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: format.currencyCode,
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      }).format(value);
    } else if (format?.thousandSeparator === false) {
      formatted = precision !== undefined ? value.toFixed(precision) : String(value);
    } else {
      formatted = new Intl.NumberFormat(locale, {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      }).format(value);
    }
  } catch {
    formatted = precision !== undefined ? value.toFixed(precision) : String(value);
  }

  const prefix = format?.currencySymbol ?? format?.prefix ?? '';
  const suffix = format?.suffix ?? '';
  const hasEmbeddedCurrency = Boolean(format?.currencyCode);
  return `${hasEmbeddedCurrency ? (format?.prefix ?? '') : prefix}${formatted}${suffix}`;
}

const EASTERN_ARABIC_ZERO = 0x0660;
const EXTENDED_ARABIC_ZERO = 0x06f0;

/**
 * Normalizes Eastern Arabic (`٠-٩`) and Urdu/Persian Extended Arabic-Indic (`۰-۹`)
 * digits + Arabic decimal separator (`٫`) into ASCII digits.
 */
export function normalizeLocalizedNumerals(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code >= EASTERN_ARABIC_ZERO && code <= EASTERN_ARABIC_ZERO + 9) {
      out += String(code - EASTERN_ARABIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_ZERO && code <= EXTENDED_ARABIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_ZERO);
    } else if (raw[i] === '٫') {
      out += '.';
    } else if (raw[i] === '٬') {
      // Strip Arabic thousands separator
    } else {
      out += raw[i];
    }
  }
  return out;
}

function usesCommaDecimalSeparator(locale?: string): boolean {
  if (!locale) return false;
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1.1);
    const dec = parts.find((p) => p.type === 'decimal')?.value;
    return dec === ',';
  } catch {
    return false;
  }
}

export function parseNumericInput(
  raw: string,
  options?: { integerOnly?: boolean; precision?: number; locale?: string }
): number | undefined {
  const normalizedDigits = normalizeLocalizedNumerals(raw);
  if (normalizedDigits.trim() === '') return undefined;

  let canonical = normalizedDigits;
  if (usesCommaDecimalSeparator(options?.locale)) {
    // e.g. 'de-DE' / 'fr-FR': '1.234,56' -> '1234.56'
    canonical = canonical.replace(/\./g, '').replace(/,/g, '.');
  } else {
    canonical = canonical.replace(/,/g, '');
  }

  const cleaned = canonical.replace(/[^0-9.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return undefined;
  }
  const parsed = options?.integerOnly
    ? Number.parseInt(cleaned, 10)
    : Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) return undefined;
  if (options?.precision !== undefined && !options.integerOnly) {
    const factor = 10 ** options.precision;
    return Math.round(parsed * factor) / factor;
  }
  return parsed;
}

export function resolvePluralizedText(
  count: number,
  forms: { zero?: string; one: string; other: string; few?: string; many?: string },
  locale = 'en'
): string {
  if (count === 0 && forms.zero) return forms.zero.replace(/\{\{\s*count\s*\}\}/g, '0');
  let category: Intl.LDMLPluralRule = 'other';
  try {
    category = new Intl.PluralRules(locale).select(count);
  } catch {
    category = count === 1 ? 'one' : 'other';
  }
  const template =
    (category === 'one' && forms.one) ||
    (category === 'few' && forms.few) ||
    (category === 'many' && forms.many) ||
    forms.other;
  return template.replace(/\{\{\s*count\s*\}\}/g, String(count));
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function calculateAgeInYears(dobInput: string | Date, referenceDate = new Date()): number | null {
  const dob = dobInput instanceof Date ? dobInput : new Date(dobInput);
  if (Number.isNaN(dob.getTime())) return null;
  let age = referenceDate.getFullYear() - dob.getFullYear();
  const monthDiff = referenceDate.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

export function formatDateISO(date: Date, mode: 'date' | 'time' | 'datetime' = 'date'): string {
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());

  if (mode === 'date') return `${y}-${m}-${d}`;
  if (mode === 'time') return `${hh}:${mm}`;
  return `${y}-${m}-${d}T${hh}:${mm}`;
}
