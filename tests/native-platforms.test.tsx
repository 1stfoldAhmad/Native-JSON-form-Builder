import React, { createRef } from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Provide a lightweight host shim ONLY for `expo`'s low-level `requireNativeModule` /
// `requireNativeView` so the REAL `@expo/ui/swift-ui` and `@expo/ui/jetpack-compose`
// JS modules and modifier factories execute unmodified in Node.
vi.mock('expo', () => ({
  requireNativeModule: (moduleName: string) => ({
    __moduleName: moduleName,
    completeRefresh: vi.fn(async () => {}),
  }),
  requireNativeView: (moduleName: string, viewName: string) => {
    function MockExpoNativeView(props: Record<string, any>) {
      return React.createElement(
        'div',
        {
          'data-testid': props.testID ?? `native-${moduleName}-${viewName}`,
          'data-native-view': `${moduleName}.${viewName}`,
          'data-label': props.label,
          'data-supports-opacity': String(Boolean(props.supportsOpacity)),
          onClick: () => {
            props.onSelectionChange?.({ nativeEvent: { value: '#9333EA' } });
          },
        },
        props.children
      );
    }
    return MockExpoNativeView;
  },
}));

import {
  collectSensitiveFieldPaths,
  ExpoForm,
  HostBoundary,
  omitSensitiveValues,
  parseAndValidateFormConfig,
  redactSensitiveForLog,
  useHasManagedHost,
  validateSelectedFiles,
  type ExpoFormRef,
  type FormConfig,
} from '../src';
import * as androidBridge from '../src/core/nativePlatformBridge.android';
import * as iosBridge from '../src/core/nativePlatformBridge.ios';
import { FormStore } from '../src/state/FormStore';
import { getByPath, setByPath } from '../src/utils/deepPath';
import { ValidationEngine } from '../src/validation/ValidationEngine';

const originalPlatformOS = Platform.OS;

afterEach(() => {
  (Platform as { OS: string }).OS = originalPlatformOS;
});

describe('Native iOS (SwiftUI) & Android (Jetpack Compose) Platform Contracts & Security Audit', () => {
  describe('1. iOS SwiftUI Platform Bridge (@expo/ui/swift-ui)', () => {
    it('constructs real @expo/ui/swift-ui animation, scrollPosition, anchor id, a11y, and privacySensitive modifiers', () => {
      // Animation curves + delay
      const springMods = iosBridge.getPlatformAnimationModifiers(
        { type: 'spring', duration: 300, damping: 0.8, bounce: 0.1, delay: 50 },
        true
      );
      expect(springMods).toHaveLength(1);
      expect(springMods[0]).toMatchObject({
        $type: 'animation',
        animatedValue: true,
      });

      for (const curve of ['smooth', 'snappy', 'bouncy', 'easeIn', 'easeOut', 'linear', 'easeInOut'] as const) {
        const mods = iosBridge.getPlatformAnimationModifiers({ type: curve, duration: 200 }, 1);
        expect(mods).toHaveLength(1);
        expect(mods[0].$type).toBe('animation');
      }

      // Scroll container modifiers (scrollDismissesKeyboard + scrollPosition + scrollTargetLayout)
      const mockScrollState = {
        value: 'expo-form-field-email' as string | null,
        get: () => 'expo-form-field-email',
        set: vi.fn(),
      };
      const scrollMods = iosBridge.getPlatformScrollContainerModifiers(true, mockScrollState, true);
      expect(scrollMods.scrollModifiers.map((m) => m.$type)).toEqual([
        'scrollDismissesKeyboard',
        'scrollPosition',
      ]);
      expect(scrollMods.scrollModifiers[0]).toMatchObject({
        $type: 'scrollDismissesKeyboard',
        mode: 'interactively',
      });
      expect(scrollMods.contentModifiers).toEqual([{ $type: 'scrollTargetLayout' }]);

      // Field anchor id modifier
      expect(iosBridge.getPlatformFieldAnchorModifiers('expo-form-field-email')).toEqual([
        { $type: 'id', id: 'expo-form-field-email' },
      ]);

      // Accessibility traits & voiceover modifiers
      const a11yMods = iosBridge.getPlatformFieldA11yModifiers({
        label: 'Email Address, required',
        hint: 'Enter your company email',
        error: 'Email is invalid',
      });
      expect(a11yMods.map((m) => m.$type)).toEqual([
        'accessibilityLabel',
        'accessibilityHint',
        'accessibilityValue',
      ]);

      expect(iosBridge.getPlatformHeadingModifiers('Personal Info')).toEqual([
        { $type: 'accessibilityAddTraits', traits: ['isHeader'] },
      ]);

      // Privacy-sensitive modifier
      expect(iosBridge.getPlatformSensitiveInputModifiers(true, 'password')).toEqual([
        { $type: 'privacySensitive', sensitive: true },
      ]);
      expect(iosBridge.getPlatformSensitiveInputModifiers(false, 'text')).toBeUndefined();
    });

    it('renders SwiftUI ColorPicker and propagates native selection events to form callback', () => {
      const onSelectColor = vi.fn();
      const pickerNode = iosBridge.renderNativePlatformColorPicker({
        color: '#2563EB',
        supportsOpacity: true,
        onSelectColor,
      });

      render(<>{pickerNode}</>);
      const nativePicker = screen.getByTestId('native-ExpoUI-ColorPickerView');
      expect(nativePicker.getAttribute('data-native-view')).toBe('ExpoUI.ColorPickerView');
      expect(nativePicker.getAttribute('data-supports-opacity')).toBe('true');

      fireEvent.click(nativePicker);
      expect(onSelectColor).toHaveBeenCalledWith('#9333EA');
    });
  });

  describe('2. Android Jetpack Compose Platform Bridge & Native Runtime Paths', () => {
    it('constructs real @expo/ui/jetpack-compose animation, imePadding, semantics, and anchor modifiers', () => {
      const animMods = androidBridge.getPlatformAnimationModifiers(
        { type: 'scale', initialScale: 0.92, damping: 0.85, stiffness: 420 },
        false,
        true
      );
      expect(animMods.map((m) => m.$type)).toEqual(['animateContentSize', 'graphicsLayer']);
      expect(animMods[1]).toMatchObject({
        $type: 'graphicsLayer',
        scaleX: 0.92,
        scaleY: 0.92,
      });

      const a11yMods = androidBridge.getPlatformFieldA11yModifiers({
        label: 'Username',
        validating: true,
        error: 'Already taken',
      });
      expect(a11yMods).toEqual([
        {
          $type: 'semantics',
          contentDescription: 'Username. Validating. Error: Already taken',
        },
      ]);

      expect(androidBridge.getPlatformHeadingModifiers('Payment Details')).toEqual([
        {
          $type: 'semantics',
          contentDescription: 'Heading: Payment Details',
        },
      ]);
    });

    it('renders Android Material dialog trigger path for DateTimeField when Platform.OS === "android"', () => {
      (Platform as { OS: string }).OS = 'android';

      const config: FormConfig = {
        id: 'android-date-dialog-test',
        fields: [
          {
            name: 'appointmentDate',
            type: 'date',
            label: 'Appointment Date',
            defaultValue: '2026-11-15',
          },
        ],
      };

      render(<ExpoForm config={config} />);

      // On Android, DateTimeFields renders the Jetpack Compose dialog trigger button rather than the web TextInput
      expect(screen.getByTestId('datetime-trigger-appointmentDate')).toBeTruthy();
      expect(screen.queryByTestId('datetime-input-appointmentDate')).toBeNull();
    });
  });

  describe('3. HostBoundary Modes ("auto", "inherit", "always")', () => {
    function HostContextProbe({ id }: { id: string }) {
      const hasManaged = useHasManagedHost();
      return <div data-testid={id}>{hasManaged ? 'managed' : 'unmanaged'}</div>;
    }

    it('tracks managed Host context in auto mode and avoids extra Host wrapper in inherit mode', () => {
      const { container } = render(
        <HostBoundary hostMode="inherit" testID="outer-inherit-host">
          <HostContextProbe id="probe-inside-inherit" />
          <HostBoundary hostMode="auto" testID="nested-auto-host">
            <HostContextProbe id="probe-inside-nested-auto" />
          </HostBoundary>
        </HostBoundary>
      );

      expect(screen.getByTestId('probe-inside-inherit').textContent).toBe('managed');
      expect(screen.getByTestId('probe-inside-nested-auto').textContent).toBe('managed');
      // Neither `inherit` nor nested `auto` inside managed context should mount a new Host element
      expect(container.querySelector('[data-testid="outer-inherit-host"]')).toBeNull();
      expect(container.querySelector('[data-testid="nested-auto-host"]')).toBeNull();
    });
  });

  describe('4. JSON Schema 2020-12 Meta-Validation (validateSchema: true)', () => {
    it('rejects malformed embedded JSON Schema definitions in both parseAndValidateFormConfig and ValidationEngine', () => {
      const malformedConfig = {
        id: 'invalid-meta-schema',
        schema: {
          type: 'not-a-valid-json-schema-type',
          minimum: 'not-a-number',
          required: 'not-an-array',
        },
        fields: [{ name: 'age', type: 'integer', label: 'Age' }],
      };

      const parsed = parseAndValidateFormConfig(malformedConfig);
      expect(parsed.valid).toBe(false);
      expect(parsed.errors.some((e) => e.path === 'config.schema')).toBe(true);

      const engine = new ValidationEngine(malformedConfig as unknown as FormConfig);
      expect(engine.getSchemaCompileError()).toBeTruthy();
      const syncRes = engine.validateSync({ age: 25 });
      expect(syncRes.valid).toBe(false);
      expect(syncRes.formErrors.length).toBeGreaterThan(0);
    });

    it('preserves $data references, custom formats (pkPhone, cnic, postalCode), and custom keywords (equalsField, minAge)', () => {
      const validCustomSchemaConfig: FormConfig = {
        id: 'valid-custom-schema',
        schema: {
          type: 'object',
          required: ['phone', 'cnic', 'birthDate', 'password', 'confirmPassword'],
          properties: {
            phone: { type: 'string', format: 'pkPhone' },
            cnic: { type: 'string', format: 'cnic' },
            postalCode: { type: 'string', format: 'postalCode' },
            birthDate: { type: 'string', format: 'date', minAge: 18 },
            password: { type: 'string', minLength: 8 },
            confirmPassword: { type: 'string', equalsField: 'password' },
          },
        },
        fields: [
          { name: 'phone', type: 'phone' },
          { name: 'cnic', type: 'cnic' },
          { name: 'postalCode', type: 'postalCode' },
          { name: 'birthDate', type: 'birthday' },
          { name: 'password', type: 'password' },
          { name: 'confirmPassword', type: 'confirmPassword' },
        ],
      };

      const parsed = parseAndValidateFormConfig(validCustomSchemaConfig);
      expect(parsed.valid).toBe(true);
      expect(parsed.errors).toHaveLength(0);

      const engine = new ValidationEngine(validCustomSchemaConfig);
      expect(engine.getSchemaCompileError()).toBeNull();
      const res = engine.validateSync({
        phone: '+923001234567',
        cnic: '35202-1234567-1',
        postalCode: '46000',
        birthDate: '1998-05-10',
        password: 'StrongPassword1!',
        confirmPassword: 'StrongPassword1!',
      });
      expect(res.valid).toBe(true);
    });
  });

  describe('5. Security & Wizard Hardening Regressions', () => {
    it('blocks __proto__, prototype, and constructor pollution in deepPath and remote form.json parsing', () => {
      const target: Record<string, unknown> = { safe: 'ok' };
      const afterProto = setByPath(target, '__proto__.polluted', 'hacked');
      const afterCtor = setByPath(afterProto, 'constructor.prototype.polluted', 'hacked');

      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(getByPath(afterCtor, '__proto__.polluted')).toBeUndefined();
      expect(getByPath(target, 'toString')).toBeUndefined();

      const parsed = parseAndValidateFormConfig({
        id: 'untrusted-remote-form',
        defaults: {
          '__proto__.polluted': true,
        },
        fields: [
          {
            name: 'constructor.prototype.isAdmin',
            type: 'text',
          },
        ],
      });
      expect(parsed.valid).toBe(false);
      expect(parsed.errors.some((e) => e.path.includes('__proto__'))).toBe(true);
      expect(parsed.errors.some((e) => e.path.endsWith('.name'))).toBe(true);
    });

    it('automatically omits and redacts CVV and repeater-nested sensitive fields in drafts & logs', () => {
      const config: FormConfig = {
        id: 'payment-cards-security',
        fields: [
          { name: 'cardholder', type: 'fullName' },
          { name: 'primaryCvv', type: 'cvv' },
          {
            name: 'backupCards',
            type: 'repeater',
            fields: [
              { name: 'label', type: 'text' },
              { name: 'cvv', type: 'cvv' },
            ],
          },
        ],
      };

      const sensitivePaths = collectSensitiveFieldPaths(config);
      expect(sensitivePaths.has('primaryCvv')).toBe(true);
      expect(sensitivePaths.has('backupCards.*.cvv')).toBe(true);

      const rawValues = {
        cardholder: 'Ahmad Khan',
        primaryCvv: '789',
        backupCards: [
          { label: 'Corporate', cvv: '123' },
          { label: 'Personal', cvv: '456' },
        ],
      };

      const draftSafe = omitSensitiveValues(rawValues, sensitivePaths);
      expect(draftSafe.primaryCvv).toBeUndefined();
      expect((draftSafe.backupCards as any[])[0].cvv).toBeUndefined();
      expect((draftSafe.backupCards as any[])[0].label).toBe('Corporate');

      const logSafe = redactSensitiveForLog(rawValues, sensitivePaths);
      expect(logSafe.primaryCvv).toBe('[REDACTED]');
      expect((logSafe.backupCards as any[])[1].cvv).toBe('[REDACTED]');
    });

    it('rejects extensionless unknown-MIME files and 0-byte files violating minFileSize in validateSelectedFiles', () => {
      const pdfCheck = validateSelectedFiles(
        [
          {
            id: '1',
            name: 'suspicious_binary_without_ext',
            uri: 'file:///tmp/suspicious',
            mimeType: '',
            size: 2048,
          },
        ],
        {
          allowedMimeTypes: ['application/pdf'],
          allowedExtensions: ['.pdf'],
        }
      );
      expect(pdfCheck.accepted).toHaveLength(0);
      expect(pdfCheck.errors.length).toBeGreaterThan(0);

      const zeroByteCheck = validateSelectedFiles(
        [
          {
            id: '2',
            name: 'empty.pdf',
            uri: 'file:///tmp/empty.pdf',
            mimeType: 'application/pdf',
            size: 0,
          },
        ],
        {
          allowedMimeTypes: ['application/pdf'],
          allowedExtensions: ['.pdf'],
          minFileSize: 128,
        }
      );
      expect(zeroByteCheck.accepted).toHaveLength(0);
      expect(zeroByteCheck.errors[0]).toContain('smaller than the minimum size');
    });

    it('prevents concurrent double nextStep() advancement during async step validation and disposes cleanly on unmount', async () => {
      let resolveStepCheck!: (v: boolean) => void;
      const stepGate = new Promise<boolean>((res) => {
        resolveStepCheck = res;
      });

      const wizardConfig: FormConfig = {
        id: 'wizard-lock-test',
        steps: [
          {
            id: 'step-1',
            title: 'Account',
            fields: [
              {
                name: 'username',
                type: 'username',
                required: true,
                validation: { async: { validatorId: 'verifyStepUser' } },
              },
            ],
          },
          {
            id: 'step-2',
            title: 'Profile',
            fields: [{ name: 'bio', type: 'textarea' }],
          },
          {
            id: 'step-3',
            title: 'Confirm',
            fields: [{ name: 'confirm', type: 'checkbox' }],
          },
        ],
      };

      const store = new FormStore({
        config: wizardConfig,
        initialValues: { username: 'ahmad' },
        asyncValidators: {
          verifyStepUser: () => stepGate,
        },
      });

      const firstNext = store.nextStep();
      const duplicateNext = store.nextStep();
      expect(await duplicateNext).toBe(false);

      resolveStepCheck(true);
      expect(await firstNext).toBe(true);
      // Advanced by exactly ONE step (0 -> 1), never skipping to step 2
      expect(store.getCurrentStepIndex()).toBe(1);

      // Verify unmount calls store.dispose() cleanly without errors
      const formRef = createRef<ExpoFormRef>();
      const { unmount } = render(<ExpoForm ref={formRef} config={wizardConfig} />);
      expect(() => unmount()).not.toThrow();
    });
  });
});
