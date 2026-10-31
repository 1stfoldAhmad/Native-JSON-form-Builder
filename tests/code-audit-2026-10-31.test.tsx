import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo', () => ({
  requireNativeModule: (moduleName: string) => ({
    __moduleName: moduleName,
    completeRefresh: vi.fn(async () => {}),
  }),
  requireNativeView: (moduleName: string, viewName: string) => {
    function MockExpoNativeView(props: Record<string, any>) {
      return React.createElement(
        'div',
        { 'data-testid': props.testID ?? `native-${moduleName}-${viewName}` },
        props.children
      );
    }
    return MockExpoNativeView;
  },
}));

import {
  analyzeRegexSafety,
  BUILT_IN_SECRET_FIELD_TYPES,
  collectSensitiveFieldPaths,
  compileSafeRegex,
  evaluateCondition,
  evaluatePasswordStrength,
  ExpoForm,
  FormStore,
  isBuiltInSecretFieldType,
  isSensitiveField,
  isValidCNIC,
  isValidEmail,
  isValidPhone,
  isValidPostalCode,
  MAX_REGEX_INPUT_LENGTH,
  MAX_REGEX_PATTERN_LENGTH,
  omitSensitiveValues,
  parseAndValidateFormConfig,
  redactSensitiveForLog,
  safeRegexTest,
  ValidationEngine,
  type FormConfig,
} from '../src';
import * as androidBridge from '../src/core/nativePlatformBridge.android';
import * as iosBridge from '../src/core/nativePlatformBridge.ios';

describe('Code Audit Regressions (31 Oct 2026) — Security, ReDoS, iOS Keyboard, Scale & Packaging', () => {
  // ===========================================================================
  // Priority 1 (P1): Built-in secret fields cannot opt out via `sensitive: false`
  // ===========================================================================
  describe('Priority 1 — Non-overridable sensitive field protection', () => {
    it('treats built-in secret types and security.sensitiveFields as sensitive even when sensitive: false is set', () => {
      for (const secretType of BUILT_IN_SECRET_FIELD_TYPES) {
        expect(isBuiltInSecretFieldType(secretType)).toBe(true);
        expect(
          isSensitiveField({
            name: `secret_${secretType}`,
            type: secretType as any,
            sensitive: false,
          })
        ).toBe(true);
      }

      // Specific audit payload: `{ "name": "password", "type": "password", "sensitive": false }`
      expect(
        isSensitiveField({ name: 'password', type: 'password', sensitive: false })
      ).toBe(true);

      // Form-level `security.sensitiveFields` policy also cannot be bypassed by field-level `sensitive: false`
      expect(
        isSensitiveField(
          { name: 'nationalTaxId', type: 'text', sensitive: false },
          { sensitiveFields: ['nationalTaxId'] }
        )
      ).toBe(true);

      // Ordinary text fields remain opt-in
      expect(isSensitiveField({ name: 'firstName', type: 'text', sensitive: false })).toBe(
        false
      );
      expect(isSensitiveField({ name: 'firstName', type: 'text' })).toBe(false);
      expect(isSensitiveField({ name: 'firstName', type: 'text', sensitive: true })).toBe(
        true
      );
    });

    it('never persists, restores, or logs `{ name: "password", type: "password", sensitive: false }` even when draft.excludeSensitive is false', async () => {
      vi.useFakeTimers();
      try {
        const storage = new Map<string, string>();
        // Pre-seed storage with a poisoned draft containing leaked credentials
        storage.set(
          'expo-form-draft:audit-secret-override',
          JSON.stringify({
            email: 'ahmad@1stfold.com',
            password: 'PoisonedDraftPassword!',
            otpCode: '998877',
          })
        );

        const config: FormConfig = {
          id: 'audit-secret-override',
          draft: {
            enabled: true,
            debounceMs: 10,
            excludeSensitive: false,
          },
          security: {
            protectSensitiveFields: false,
            clearSensitiveOnReset: true,
          },
          fields: [
            { name: 'email', type: 'email' },
            { name: 'password', type: 'password', sensitive: false },
            { name: 'otpCode', type: 'otp', sensitive: false },
          ],
        };

        // 1. Parser emits an explicit warning when `sensitive: false` is set on protected secret types
        const parsed = parseAndValidateFormConfig(config);
        expect(parsed.valid).toBe(true);
        const warnings = parsed.issues.filter((i) => i.severity === 'warning');
        expect(warnings.map((w) => w.path)).toEqual(
          expect.arrayContaining([
            'config.fields[1].sensitive',
            'config.fields[2].sensitive',
          ])
        );

        // 2. Store strips poisoned password & otp on draft restore
        const store = new FormStore({
          config,
          storageAdapter: {
            getItem: (k) => storage.get(k) ?? null,
            setItem: (k, v) => {
              storage.set(k, v);
            },
            removeItem: (k) => {
              storage.delete(k);
            },
          },
        });

        expect(store.getValue('email')).toBe('ahmad@1stfold.com');
        expect(store.getValue('password')).toBeUndefined();
        expect(store.getValue('otpCode')).toBeUndefined();

        // 3. Typing into password & otp never writes them to draft storage
        store.setValueFromUserInput('password', 'UltraSecret#2026');
        store.setValueFromUserInput('otpCode', '123456');
        vi.advanceTimersByTime(50);

        const savedRaw = storage.get('expo-form-draft:audit-secret-override')!;
        const savedObj = JSON.parse(savedRaw);
        expect(savedObj.email).toBe('ahmad@1stfold.com');
        expect(savedObj).not.toHaveProperty('password');
        expect(savedObj).not.toHaveProperty('otpCode');

        // 4. Redaction & omission helpers unconditionally scrub password & otp
        const sensitiveSet = collectSensitiveFieldPaths(config);
        expect(sensitiveSet.has('password')).toBe(true);
        expect(sensitiveSet.has('otpCode')).toBe(true);

        const redacted = redactSensitiveForLog(store.getValues(), sensitiveSet);
        expect(redacted.password).toBe('[REDACTED]');
        expect(redacted.otpCode).toBe('[REDACTED]');

        const omitted = omitSensitiveValues(store.getValues(), sensitiveSet);
        expect(omitted).not.toHaveProperty('password');
        expect(omitted).not.toHaveProperty('otpCode');

        // 5. `store.reset()` clears sensitive fields when `clearSensitiveOnReset` is true
        store.reset();
        expect(store.getValue('password')).toBe('');
        expect(store.getValue('otpCode')).toBe('');

        store.dispose();
      } finally {
        vi.useRealTimers();
      }
    });

    it('renders password and otp fields with sensitive modifiers intact even when sensitive: false is configured', () => {
      const config: FormConfig = {
        id: 'render-sensitive-override',
        fields: [
          { name: 'password', type: 'password', label: 'Password', sensitive: false },
          { name: 'otp', type: 'otp', label: 'OTP Code', sensitive: false },
        ],
      };

      const { getByTestId } = render(<ExpoForm config={config} />);
      expect(getByTestId('input-password')).toBeTruthy();
      expect(getByTestId('input-otp')).toBeTruthy();
    });
  });

  // ===========================================================================
  // Priority 2 (P1/P2): Arbitrary Regex / ReDoS Protection
  // ===========================================================================
  describe('Priority 2 — Arbitrary regex & ReDoS protection', () => {
    it('statically blocks catastrophic-backtracking patterns, backreferences, stateful flags, and oversized patterns', () => {
      const unsafePatterns: Array<[string, string?]> = [
        ['(a+)+$'],
        ['([a-zA-Z]+)*$'],
        ['([a-z-]+-)+$'],
        ['([a-z]+.)+$'],
        ['(a|aa)+$'],
        ['(a|)+$'],
        ['(.*|x)+'],
        ['.*.*a'],
        ['^([a-z]+)\\1$'],
        ['^(?<word>\\w+)\\k<word>$'],
        ['(?<=foo)bar'],
        ['a{1001}'],
        ['a{5,2}'],
        ['a'.repeat(MAX_REGEX_PATTERN_LENGTH + 1)],
        ['^[a-z]+$', 'g'],
        ['^[a-z]+$', 'y'],
      ];

      for (const [pattern, flags] of unsafePatterns) {
        const res = analyzeRegexSafety(pattern, flags);
        expect(res.safe).toBe(false);
        expect(compileSafeRegex(pattern, flags)).toBeNull();
      }

      // Safe real-world patterns remain valid and cached
      const safePatterns: Array<[string, string?]> = [
        ['^\\d{5}-\\d{7}-\\d$'],
        ['^[A-Za-z0-9_.-]{3,32}$'],
        ['^(?:\\+?92[-\\s]?|0)?3\\d{2}[-\\s]?\\d{7}$'],
        ['^[a-z0-9]+(?:-[a-z0-9]+)*$', 'i'],
      ];
      for (const [pattern, flags] of safePatterns) {
        expect(analyzeRegexSafety(pattern, flags).safe).toBe(true);
        expect(compileSafeRegex(pattern, flags)).toBeInstanceOf(RegExp);
      }
    });

    it('rejects ReDoS patterns in configParser across field regex, conditions, phone/cnic/password patterns, and embedded AJV schema', () => {
      const untrustedConfig = {
        id: 'redos-remote-config',
        schema: {
          type: 'object',
          properties: {
            bio: {
              type: 'string',
              pattern: '(a+)+$',
            },
          },
        },
        fields: [
          {
            name: 'bio',
            type: 'text',
            validation: {
              regex: { pattern: '([a-zA-Z]+)*$' },
            },
            visibleWhen: {
              field: 'trigger',
              matches: '(a|aa)+$',
            },
          },
          {
            name: 'phone',
            type: 'phone',
            validation: {
              phone: { pattern: '(0+)+$' },
            },
          },
          {
            name: 'cnic',
            type: 'cnic',
            validation: {
              cnic: { pattern: '(\\d+)+$' },
            },
          },
          {
            name: 'pwd',
            type: 'password',
            validation: {
              password: { specialCharPattern: '([!@#]+)+$' },
            },
          },
        ],
      };

      const parsed = parseAndValidateFormConfig(untrustedConfig);
      expect(parsed.valid).toBe(false);
      const errorPaths = parsed.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.path);

      expect(errorPaths).toEqual(
        expect.arrayContaining([
          'config.schema.properties.bio.pattern',
          'config.fields[0].visibleWhen.matches',
          'config.fields[0].validation.regex',
          'config.fields[1].validation.phone.pattern',
          'config.fields[2].validation.cnic.pattern',
          'config.fields[3].validation.password.specialCharPattern',
        ])
      );
    });

    it('evaluates adversarial inputs against `(a+)+$` in < 25ms and fails closed across ValidationEngine and evaluateCondition', () => {
      const adversarialInput = `${'a'.repeat(80)}!`;

      const startCond = performance.now();
      const matched = evaluateCondition(
        { field: 'code', matches: '(a+)+$' },
        { code: adversarialInput }
      );
      const condDurationMs = performance.now() - startCond;
      expect(matched).toBe(false);
      expect(condDurationMs).toBeLessThan(25);

      const engine = new ValidationEngine({
        id: 'redos-runtime-defense',
        fields: [
          {
            name: 'code',
            type: 'text',
            label: 'Promo Code',
            validation: {
              regex: '(a+)+$',
            },
          },
        ],
      });

      const startVal = performance.now();
      const result = engine.validateSync({ code: adversarialInput });
      const valDurationMs = performance.now() - startVal;

      expect(valDurationMs).toBeLessThan(25);
      // Fails closed — unsafe regex never silently passes unvalidated input
      expect(result.valid).toBe(false);
      expect(result.errors.code).toBeTruthy();

      // Embedded AJV schema with `(a+)+$` also fails closed without compiling unsafe RegExp
      const schemaEngine = new ValidationEngine({
        id: 'redos-ajv-defense',
        schema: {
          type: 'object',
          properties: {
            code: { type: 'string', pattern: '(a+)+$' },
          },
        },
        fields: [{ name: 'code', type: 'text' }],
      });
      const schemaRes = schemaEngine.validateSync({ code: adversarialInput });
      expect(schemaRes.valid).toBe(false);
      expect(schemaRes.formErrors.length).toBeGreaterThan(0);
    });

    it('enforces MAX_REGEX_INPUT_LENGTH on oversized pasted payloads', () => {
      const hugePayload = 'a'.repeat(MAX_REGEX_INPUT_LENGTH + 500);

      expect(safeRegexTest('^[a-z]+$', hugePayload)).toMatchObject({
        matched: false,
        blocked: true,
      });
      expect(isValidEmail(hugePayload)).toBe(false);
      expect(isValidPhone(hugePayload, 'PK')).toBe(false);
      expect(isValidCNIC(hugePayload)).toBe(false);
      expect(isValidPostalCode(hugePayload, 'US')).toBe(false);

      const pwdRes = evaluatePasswordStrength(hugePayload, { minLength: 8 });
      expect(pwdRes.passed).toBe(false);
    });
  });

  // ===========================================================================
  // Priority 3 (P2): iOS & Android `scroll.keyboardAware` Parity
  // ===========================================================================
  describe('Priority 3 — Cross-platform scroll.keyboardAware parity', () => {
    it('aligns iOS SwiftUI ignoreSafeArea(keyboard) and Android Compose imePadding() for keyboardAware true vs false', () => {
      const dummyScrollState = {
        value: null as string | null,
        get: () => null,
        set: vi.fn(),
      };

      // keyboardAware: true (default)
      const iosEnabled = iosBridge.getPlatformScrollContainerModifiers(
        true,
        dummyScrollState,
        true
      );
      const androidEnabled = androidBridge.getPlatformScrollContainerModifiers(
        true,
        dummyScrollState,
        true
      );
      expect(
        iosEnabled.scrollModifiers.some((m) => m.$type === 'ignoreSafeArea')
      ).toBe(false);
      expect(
        androidEnabled.contentModifiers.some((m) => m.$type === 'imePadding')
      ).toBe(true);

      // keyboardAware: false (`{ scroll: { keyboardAware: false } }`)
      const iosDisabled = iosBridge.getPlatformScrollContainerModifiers(
        true,
        dummyScrollState,
        false
      );
      const androidDisabled = androidBridge.getPlatformScrollContainerModifiers(
        true,
        dummyScrollState,
        false
      );
      expect(iosDisabled.scrollModifiers).toContainEqual({
        $type: 'ignoreSafeArea',
        regions: 'keyboard',
      });
      expect(
        androidDisabled.contentModifiers.some((m) => m.$type === 'imePadding')
      ).toBe(false);
    });
  });

  // ===========================================================================
  // Priority 5: Large Form & Repeater Performance + Row-Deletion Sync
  // ===========================================================================
  describe('Priority 5 — Large form & repeater scalability', () => {
    it('updates a 200-field form with isolated O(1) field notifications and lightweight getFormMeta()', () => {
      const fields = Array.from({ length: 200 }, (_, i) => ({
        name: `field_${i}`,
        type: 'text' as const,
        label: `Field ${i}`,
      }));

      const store = new FormStore({
        config: {
          id: 'perf-200-fields',
          fields,
        },
      });

      const targetListener = vi.fn();
      const bystanderListener = vi.fn();
      store.subscribePaths(['field_0'], targetListener);
      store.subscribePaths(['field_199'], bystanderListener);

      const start = performance.now();
      for (let k = 0; k < 50; k += 1) {
        store.setValueFromUserInput('field_0', `value_${k}`);
        const meta = store.getFormMeta();
        expect(meta.isDirty).toBe(true);
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(250);
      expect(targetListener).toHaveBeenCalledTimes(50);
      // Untargeted fields receive ZERO notifications across 50 keystrokes
      expect(bystanderListener).toHaveBeenCalledTimes(0);

      store.dispose();
    });

    it('handles 40-row repeaters (160 nested fields) and bumps child external versions when removing rows', () => {
      const initialItems = Array.from({ length: 40 }, (_, i) => ({
        company: `Company ${i}`,
        role: `Engineer ${i}`,
        city: 'Lahore',
        years: String((i % 5) + 1),
      }));

      const store = new FormStore({
        config: {
          id: 'perf-repeater-40',
          fields: [
            {
              name: 'workHistory',
              type: 'repeater',
              fields: [
                { name: 'company', type: 'text', required: true },
                { name: 'role', type: 'text', required: true },
                { name: 'city', type: 'text' },
                { name: 'years', type: 'text' },
              ],
            },
          ],
        },
        initialValues: {
          workHistory: initialItems,
        },
      });

      const vBefore = store.getExternalVersion('workHistory.0.company');
      // Simulate RepeaterField removing row #0 via user `onChange`
      const afterRemoveFirst = initialItems.slice(1);
      store.setValueFromUserInput('workHistory', afterRemoveFirst);

      const vAfter = store.getExternalVersion('workHistory.0.company');
      expect(vAfter).toBeGreaterThan(vBefore);
      expect(store.getValue('workHistory.0.company')).toBe('Company 1');

      store.dispose();
    });
  });

  // ===========================================================================
  // Priority 6: NPM Package Tarball & TypeScript Declaration Readiness
  // ===========================================================================
  describe('Priority 6 — Package export & build artifact readiness', () => {
    it('ships valid package exports, build config without @types/node leakage, platform bridges, and schema', () => {
      const rootDir = path.resolve(__dirname, '..');
      const pkg = JSON.parse(
        fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
      );
      const buildTsConfig = JSON.parse(
        fs.readFileSync(path.join(rootDir, 'tsconfig.build.json'), 'utf8')
      );

      expect(pkg.main).toBe('./dist/index.js');
      expect(pkg.types).toBe('./dist/index.d.ts');
      expect(pkg.exports['.'].default).toBe('./dist/index.js');
      expect(pkg.exports['.']['react-native']).toBe('./dist/index.js');
      expect(pkg.exports['./schema/expo-form.schema.json']).toBe(
        './schema/expo-form.schema.json'
      );
      expect(buildTsConfig.compilerOptions.outDir).toBe('./dist');
      expect(buildTsConfig.compilerOptions.rootDir).toBe('./src');
      expect(buildTsConfig.compilerOptions.types).toEqual([]);

      const requiredSourceFiles = [
        'src/index.ts',
        'src/core/nativePlatformBridge.tsx',
        'src/core/nativePlatformBridge.ios.tsx',
        'src/core/nativePlatformBridge.android.tsx',
        'schema/expo-form.schema.json',
      ];
      for (const rel of requiredSourceFiles) {
        expect(fs.existsSync(path.join(rootDir, rel))).toBe(true);
      }

      // If `npm run build` has already emitted `dist/`, also verify build artifacts & clean declarations
      if (fs.existsSync(path.join(rootDir, 'dist/index.d.ts'))) {
        expect(fs.existsSync(path.join(rootDir, 'dist/index.js'))).toBe(true);
        expect(
          fs.existsSync(path.join(rootDir, 'dist/core/nativePlatformBridge.ios.js'))
        ).toBe(true);
        expect(
          fs.existsSync(path.join(rootDir, 'dist/core/nativePlatformBridge.android.js'))
        ).toBe(true);
        const indexDts = fs.readFileSync(path.join(rootDir, 'dist/index.d.ts'), 'utf8');
        expect(indexDts).not.toContain('types="node"');
      }
    });
  });
});
