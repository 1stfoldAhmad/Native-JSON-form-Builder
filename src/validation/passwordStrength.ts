import type { PasswordValidationConfig } from '../types';

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too Short' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  passed: boolean;
  unmetRules: string[];
  color: string;
  errors: string[];
  checks: {
    minLength: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    specialChar: boolean;
    noSpaces: boolean;
  };
}

const DEFAULT_SPECIAL_REGEX = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export function evaluatePasswordStrength(
  value: string,
  config?: PasswordValidationConfig
): PasswordStrengthResult {
  const minLength = config?.minLength ?? 8;
  const specialRegex = config?.specialCharPattern
    ? new RegExp(config.specialCharPattern)
    : DEFAULT_SPECIAL_REGEX;

  const checks = {
    minLength: value.length >= minLength,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    specialChar: specialRegex.test(value),
    noSpaces: !/\s/.test(value),
  };

  const errors: string[] = [];

  if (value.length < minLength) {
    errors.push(
      config?.messages?.minLength ?? `Password must be at least ${minLength} characters`
    );
  }
  if (config?.maxLength !== undefined && value.length > config.maxLength) {
    errors.push(
      config?.messages?.maxLength ?? `Password must be at most ${config.maxLength} characters`
    );
  }
  if (config?.requireUppercase && !checks.uppercase) {
    errors.push(
      config?.messages?.uppercase ?? 'Password must include at least one uppercase letter'
    );
  }
  if (config?.requireLowercase && !checks.lowercase) {
    errors.push(
      config?.messages?.lowercase ?? 'Password must include at least one lowercase letter'
    );
  }
  if (config?.requireNumber && !checks.number) {
    errors.push(config?.messages?.number ?? 'Password must include at least one number');
  }
  if (config?.requireSpecialChar && !checks.specialChar) {
    errors.push(
      config?.messages?.specialChar ?? 'Password must include at least one special character'
    );
  }
  if (config?.disallowSpaces && !checks.noSpaces) {
    errors.push(config?.messages?.spaces ?? 'Password must not contain spaces');
  }

  let rawPoints = 0;
  if (value.length >= minLength) rawPoints += 1;
  if (value.length >= 12) rawPoints += 1;
  if (checks.uppercase && checks.lowercase) rawPoints += 1;
  if (checks.number) rawPoints += 1;
  if (checks.specialChar) rawPoints += 1;

  const score = (
    value.length === 0
      ? 0
      : value.length < minLength
        ? 0
        : Math.min(4, Math.max(1, rawPoints - 1))
  ) as 0 | 1 | 2 | 3 | 4;

  if (config?.minStrengthScore !== undefined && score < config.minStrengthScore && errors.length === 0) {
    errors.push(config?.messages?.strength ?? 'Please choose a stronger password');
  }

  const metaByScore: Record<
    0 | 1 | 2 | 3 | 4,
    { label: PasswordStrengthResult['label']; color: string }
  > = {
    0: { label: 'Too Short', color: '#DC2626' },
    1: { label: 'Weak', color: '#EA580C' },
    2: { label: 'Fair', color: '#D97706' },
    3: { label: 'Strong', color: '#16A34A' },
    4: { label: 'Very Strong', color: '#059669' },
  };

  return {
    score,
    label: metaByScore[score].label,
    passed: errors.length === 0,
    unmetRules: errors,
    color: metaByScore[score].color,
    errors,
    checks,
  };
}
