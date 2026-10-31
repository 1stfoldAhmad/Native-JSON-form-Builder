import { getCountryByCode } from '../utils/countries';
import {
  compileSafeRegex,
  MAX_REGEX_INPUT_LENGTH,
  safeRegexTest,
} from '../utils/regexSafety';

export const VALIDATION_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  pkPhone: /^(?:\+?92[-\s]?|0)?3\d{2}[-\s]?\d{7}$/,
  intlPhoneNormalized: /^\+?[1-9]\d{6,14}$/,
  cnicDashed: /^\d{5}-\d{7}-\d$/,
  cnicPlain: /^\d{13}$/,
  username: /^[a-zA-Z0-9_.-]{3,32}$/,
  url: /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/[^\s]*)?$/i,
  pin: /^\d{4,8}$/,
  otp: /^[a-zA-Z0-9]{4,8}$/,
  hexColor: /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/,
} as const;

export const NAMED_VALIDATION_PRESETS: ReadonlySet<string> = new Set([
  'email',
  'pkPhone',
  'intlPhone',
  'cnic',
  'username',
  'url',
]);

export function normalizePhoneDigits(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

export function isValidEmail(value: string): boolean {
  if (value.length > MAX_REGEX_INPUT_LENGTH) return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 320) return false;
  return VALIDATION_PATTERNS.email.test(trimmed);
}

export function isValidPhone(
  value: string,
  countryOrOptions?:
    | string
    | { mode?: string; countryCode?: string; customPattern?: string }
): boolean {
  if (value.length > MAX_REGEX_INPUT_LENGTH) return false;
  const raw = value.trim();
  if (!raw) return false;

  const options =
    typeof countryOrOptions === 'string'
      ? { countryCode: countryOrOptions }
      : countryOrOptions;

  if (options?.customPattern) {
    const res = safeRegexTest(options.customPattern, raw);
    return !res.blocked && res.matched;
  }

  const country = options?.countryCode?.toUpperCase();
  if (options?.mode === 'pk' || country === 'PK') {
    const compact = raw.replace(/[\s()-]/g, '');
    return VALIDATION_PATTERNS.pkPhone.test(compact);
  }

  if (country) {
    const meta = getCountryByCode(country);
    if (meta) {
      return (
        meta.phonePattern.test(raw) ||
        VALIDATION_PATTERNS.intlPhoneNormalized.test(normalizePhoneDigits(raw))
      );
    }
  }

  const normalized = normalizePhoneDigits(raw);
  return (
    VALIDATION_PATTERNS.pkPhone.test(raw.replace(/[\s()-]/g, '')) ||
    VALIDATION_PATTERNS.intlPhoneNormalized.test(normalized)
  );
}

export function isValidEmailOrPhone(value: string, countryCode?: string): boolean {
  if (value.length > MAX_REGEX_INPUT_LENGTH) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.includes('@')) {
    return isValidEmail(trimmed);
  }
  return isValidPhone(trimmed, { countryCode });
}

export function isValidCNIC(value: string, allowUnformatted = true): boolean {
  if (value.length > MAX_REGEX_INPUT_LENGTH) return false;
  const trimmed = value.trim();
  if (VALIDATION_PATTERNS.cnicDashed.test(trimmed)) return true;
  if (allowUnformatted && VALIDATION_PATTERNS.cnicPlain.test(trimmed)) return true;
  return false;
}

export function isValidPostalCode(value: string, countryCode?: string): boolean {
  if (value.length > MAX_REGEX_INPUT_LENGTH) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const meta = getCountryByCode(countryCode);
  if (meta?.postalPattern) {
    return meta.postalPattern.test(trimmed);
  }
  return /^[A-Za-z0-9\s-]{3,12}$/.test(trimmed);
}

export function resolveNamedPattern(
  patternOrPreset: string,
  flags?: string
): RegExp | null {
  if (!flags) {
    switch (patternOrPreset) {
      case 'email':
        return VALIDATION_PATTERNS.email;
      case 'pkPhone':
        return VALIDATION_PATTERNS.pkPhone;
      case 'intlPhone':
        return VALIDATION_PATTERNS.intlPhoneNormalized;
      case 'cnic':
        return VALIDATION_PATTERNS.cnicDashed;
      case 'username':
        return VALIDATION_PATTERNS.username;
      case 'url':
        return VALIDATION_PATTERNS.url;
      default:
        break;
    }
  }
  return compileSafeRegex(patternOrPreset, flags);
}
