import { describe, expect, it, vi } from 'vitest';

import registerFormJson from '../forms/register.json';
import {
  applyMask,
  evaluatePasswordStrength,
  isValidCNIC,
  isValidEmail,
  isValidEmailOrPhone,
  isValidPhone,
  isValidPostalCode,
  stripMask,
  ValidationEngine,
  type FormConfig,
} from '../src';

describe('ValidationEngine — JSON Schema 2020-12 + Layer 2 + Cross-Field + Async', () => {
  it('validates email, phone (Pakistan & international), emailOrPhone, CNIC, and postal codes', () => {
    expect(isValidEmail('ahmad.khan@example.com')).toBe(true);
    expect(isValidEmail('invalid-email')).toBe(false);

    expect(isValidPhone('+923001234567', 'PK')).toBe(true);
    expect(isValidPhone('03001234567', 'PK')).toBe(true);
    expect(isValidPhone('12345', 'PK')).toBe(false);
    expect(isValidPhone('+14155552671', 'US')).toBe(true);

    expect(isValidEmailOrPhone('dev@1stfold.com')).toBe(true);
    expect(isValidEmailOrPhone('+923211234567')).toBe(true);
    expect(isValidEmailOrPhone('not-either')).toBe(false);

    expect(isValidCNIC('35202-1234567-1')).toBe(true);
    expect(isValidCNIC('3520212345671', false)).toBe(false);
    expect(isValidCNIC('3520212345671', true)).toBe(true);

    expect(isValidPostalCode('46000', 'PK')).toBe(true);
    expect(isValidPostalCode('94105-1234', 'US')).toBe(true);
    expect(isValidPostalCode('SW1A 1AA', 'GB')).toBe(true);
  });

  it('evaluates password strength and enforces complexity rules', () => {
    const weak = evaluatePasswordStrength('abc');
    expect(weak.score).toBeLessThanOrEqual(1);
    expect(weak.passed).toBe(false);

    const strong = evaluatePasswordStrength('Sup3r$ecurePass!2026', {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSpecialChar: true,
      disallowSpaces: true,
    });
    expect(strong.score).toBe(4);
    expect(strong.label).toBe('Very Strong');
    expect(strong.passed).toBe(true);
    expect(strong.unmetRules).toHaveLength(0);
  });

  it('applies and strips input masks cleanly (CNIC, phone, custom)', () => {
    const masked = applyMask('3520212345671', '#####-#######-#');
    expect(masked).toBe('35202-1234567-1');
    expect(stripMask(masked, '#####-#######-#')).toBe('3520212345671');
  });

  it('validates the full registration JSON schema, confirmPassword equality, age >= 18, and skips hidden fields', () => {
    const engine = new ValidationEngine(registerFormJson as unknown as FormConfig);

    // Personal account: `organization` is hidden (`visibleWhen: accountType === 'business'`)
    // so `organization` must NOT produce an error!
    const invalidPersonal = engine.validateSync({
      accountType: 'personal',
      firstName: 'A',
      lastName: '',
      username: 'bad space!',
      email: 'bad-email',
      country: 'PK',
      phone: '123',
      cnic: '12345',
      birthday: '2018-01-01', // under 18
      password: 'weak',
      confirmPassword: 'different',
      acceptTerms: false,
    });

    expect(invalidPersonal.valid).toBe(false);
    expect(invalidPersonal.errors.organization).toBeUndefined();
    expect(invalidPersonal.errors.firstName).toBeDefined();
    expect(invalidPersonal.errors.lastName).toBeDefined();
    expect(invalidPersonal.errors.username).toBeDefined();
    expect(invalidPersonal.errors.email).toBeDefined();
    expect(invalidPersonal.errors.phone).toBeDefined();
    expect(invalidPersonal.errors.cnic).toBeDefined();
    expect(invalidPersonal.errors.birthday).toContain('18');
    expect(invalidPersonal.errors.password).toBeDefined();
    expect(invalidPersonal.errors.confirmPassword).toBe('Confirm password must match password');
    expect(invalidPersonal.errors.acceptTerms).toBe(
      'You must accept the Terms of Service and Privacy Policy'
    );
    expect(invalidPersonal.firstErrorField).toBe('firstName');

    // Business account makes `organization` visible AND required via both JSON Schema if/then and `requiredWhen`
    const missingOrgBusiness = engine.validateSync({
      accountType: 'business',
      firstName: 'Ahmad',
      lastName: 'Khan',
      organization: '',
      username: 'ahmad.khan',
      email: 'ahmad@1stfold.com',
      country: 'PK',
      phone: '+923001234567',
      cnic: '35202-1234567-1',
      birthday: '1998-05-15',
      password: 'Str0ng!Password99',
      confirmPassword: 'Str0ng!Password99',
      acceptTerms: true,
    });
    expect(missingOrgBusiness.valid).toBe(false);
    expect(missingOrgBusiness.errors.organization).toBeDefined();

    // Valid business account passes completely
    const validBusiness = engine.validateSync({
      accountType: 'business',
      firstName: 'Ahmad',
      lastName: 'Khan',
      organization: '1stFold Engineering',
      username: 'ahmad.khan',
      email: 'ahmad@1stfold.com',
      country: 'PK',
      phone: '+923001234567',
      cnic: '35202-1234567-1',
      birthday: '1998-05-15',
      password: 'Str0ng!Password99',
      confirmPassword: 'Str0ng!Password99',
      acceptTerms: true,
    });
    expect(validBusiness.valid).toBe(true);
    expect(validBusiness.errors).toEqual({});
  });

  it('validates cross-field comparisons, date ranges, repeater items, and atLeastOneOf rules', () => {
    const config: FormConfig = {
      id: 'cross-field-test',
      fields: [
        { name: 'email', type: 'email', label: 'Email' },
        { name: 'backupPhone', type: 'phone', label: 'Backup Phone' },
        {
          name: 'minBudget',
          type: 'number',
          label: 'Min Budget',
          required: true,
        },
        {
          name: 'maxBudget',
          type: 'number',
          label: 'Max Budget',
          required: true,
          validation: {
            greaterThanField: 'minBudget',
          },
        },
        {
          name: 'window',
          type: 'dateRange',
          label: 'Window',
        },
        {
          name: 'members',
          type: 'repeater',
          label: 'Team Members',
          minItems: 1,
          fields: [
            { name: 'name', type: 'text', label: 'Member Name', required: true },
          ],
        },
      ],
      validation: {
        crossFieldRules: [
          {
            type: 'atLeastOneOf',
            fields: ['email', 'backupPhone'],
            message: 'Provide either an email or a backup phone',
          },
        ],
      },
    };

    const engine = new ValidationEngine(config);

    const failRes = engine.validateSync({
      email: '',
      backupPhone: '',
      minBudget: 500,
      maxBudget: 200,
      window: { start: '2026-11-20', end: '2026-11-10' },
      members: [{ name: '' }],
    });

    expect(failRes.valid).toBe(false);
    expect(failRes.errors.maxBudget).toBeDefined();
    expect(failRes.errors.window).toBeDefined();
    expect(failRes.errors['members.0.name']).toBeDefined();
    expect(failRes.errors.email).toBe('Provide either an email or a backup phone');

    const passRes = engine.validateSync({
      email: 'team@1stfold.com',
      backupPhone: '',
      minBudget: 200,
      maxBudget: 500,
      window: { start: '2026-11-10', end: '2026-11-20' },
      members: [{ name: 'Zainab' }],
    });
    expect(passRes.valid).toBe(true);
  });

  it('executes registered async validators and cancels stale requests cleanly', async () => {
    const checkUsername = vi.fn(async ({ value }: { value: unknown }) => {
      await new Promise((r) => setTimeout(r, 15));
      return value === 'taken_user' ? 'Username is already reserved' : true;
    });

    const config: FormConfig = {
      id: 'async-test',
      fields: [
        {
          name: 'username',
          type: 'username',
          label: 'Username',
          required: true,
          validation: {
            async: {
              validatorId: 'checkUsername',
              trigger: 'onBlur',
            },
          },
        },
      ],
    };

    const engine = new ValidationEngine(config);

    const takenResult = await engine.validateAsync(
      { username: 'taken_user' },
      { checkUsername },
      { trigger: 'onBlur' }
    );
    expect(takenResult.valid).toBe(false);
    expect(takenResult.errors.username).toBe('Username is already reserved');
    expect(checkUsername).toHaveBeenCalledTimes(1);

    const freeResult = await engine.validateAsync(
      { username: 'fresh_user' },
      { checkUsername },
      { trigger: 'onBlur' }
    );
    expect(freeResult.valid).toBe(true);
    expect(freeResult.errors).toEqual({});
  });
});
