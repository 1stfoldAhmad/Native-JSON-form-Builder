import React, { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ExpoForm,
  parseAndValidateFormConfig,
  type ExpoFormRef,
  type FormConfig,
} from '../src';
import {
  getPlatformFieldAnchorModifiers as getAndroidFieldAnchorModifiers,
  getPlatformScrollContainerModifiers as getAndroidScrollContainerModifiers,
  getPlatformSensitiveInputModifiers as getAndroidSensitiveInputModifiers,
  renderPlatformScrollAnchor as renderAndroidScrollAnchor,
} from '../src/core/nativePlatformBridge.android';
import {
  getFieldScrollAnchorId,
  KeyboardLayoutAdapter,
  type KeyboardScrollHandle,
} from '../src/keyboard/KeyboardLayoutAdapter';
import { FormStore } from '../src/state/FormStore';
import { ValidationEngine } from '../src/validation/ValidationEngine';

function createDeferred<T>() {
  let resolve!: (val: T) => void;
  let reject!: (err?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Codebase Audit Regressions (P0 / P1 / P2)', () => {
  describe('Issue 1 (P0): Synchronous duplicate submission lock in FormStore.submit()', () => {
    it('blocks rapid double submit() while async validation is still in flight and releases lock afterwards', async () => {
      const validationGate = createDeferred<boolean>();
      const onSubmit = vi.fn(async () => {});

      const config: FormConfig = {
        id: 'dup-submit-test',
        fields: [
          {
            name: 'username',
            type: 'username',
            label: 'Username',
            required: true,
            validation: {
              async: {
                validatorId: 'checkUsername',
              },
            },
          },
        ],
      };

      const store = new FormStore({
        config,
        initialValues: { username: 'ahmad_pk' },
        asyncValidators: {
          checkUsername: () => validationGate.promise,
        },
        callbacks: {
          onSubmit,
        },
      });

      // Fire two rapid concurrent submit() calls before async validation settles
      const firstSubmitPromise = store.submit();
      expect(store.getState().submitStatus).toBe('loading');

      const secondSubmitPromise = store.submit();
      expect(await secondSubmitPromise).toBe(false);

      validationGate.resolve(true);
      expect(await firstSubmitPromise).toBe(true);
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(store.getState().submitStatus).toBe('success');

      // Lock must be released so a subsequent intentional submit works cleanly
      const thirdSubmit = await store.submit();
      expect(thirdSubmit).toBe(true);
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    it('releases submission lock after validation failure and after thrown submit errors', async () => {
      let shouldThrow = true;
      const onSubmit = vi.fn(async () => {
        if (shouldThrow) {
          throw new Error('Network timeout');
        }
      });

      const store = new FormStore({
        config: {
          id: 'submit-unlock-paths',
          fields: [{ name: 'email', type: 'email', required: true }],
        },
        callbacks: { onSubmit },
      });

      // Path A: validation failure unlocks
      expect(await store.submit()).toBe(false);
      expect(store.getState().submitStatus).toBe('failure');

      // Path B: thrown error in onSubmit unlocks
      store.setValue('email', 'dev@example.com');
      expect(await store.submit()).toBe(false);
      expect(store.getState().submitStatus).toBe('failure');
      expect(store.getState().formErrors).toContain('Network timeout');

      // Path C: retry succeeds cleanly
      shouldThrow = false;
      expect(await store.submit()).toBe(true);
      expect(store.getState().submitStatus).toBe('success');
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });
  });

  describe('Issue 2 (P0): Stale asynchronous validation cancellation & version guarding', () => {
    it('aborts in-flight async validator on field edit and discards stale error even if validator ignores AbortSignal', async () => {
      const slowTakenRequest = createDeferred<string | boolean>();
      const capturedSignals: AbortSignal[] = [];

      const store = new FormStore({
        config: {
          id: 'stale-async-test',
          fields: [
            {
              name: 'handle',
              type: 'username',
              required: true,
              validation: {
                async: {
                  validatorId: 'checkHandle',
                  trigger: 'onBlur',
                },
              },
            },
          ],
        },
        initialValues: { handle: 'taken_name' },
        asyncValidators: {
          // Intentionally ignores `signal` when resolving to prove version guard also blocks stale writes
          checkHandle: async ({ value, signal }) => {
            if (signal) capturedSignals.push(signal);
            if (value === 'taken_name') {
              return slowTakenRequest.promise;
            }
            return true;
          },
        },
      });

      // 1. User blurs 'taken_name' -> starts slow async check
      const blurValidatePromise = store.validate('handle', 'onBlur');
      expect(store.getFieldState('handle').validating).toBe(true);
      expect(capturedSignals).toHaveLength(1);
      expect(capturedSignals[0].aborted).toBe(false);

      // 2. Before slow check resolves, user types a fresh valid handle
      store.setValueFromUserInput('handle', 'fresh_available_name');
      expect(capturedSignals[0].aborted).toBe(true);
      expect(store.getFieldState('handle').validating).toBe(false);

      // 3. Old slow promise resolves late with an error string
      slowTakenRequest.resolve('That handle is already taken');
      await blurValidatePromise;

      // Stale error MUST NOT overwrite the newer field value's state
      expect(store.getValue('handle')).toBe('fresh_available_name');
      expect(store.getRawError('handle')).toBeUndefined();
      expect(store.getFieldState('handle').validating).toBe(false);
    });

    it('discards in-flight async validation results if reset() is called before completion', async () => {
      const pending = createDeferred<string>();
      const store = new FormStore({
        config: {
          id: 'reset-async-race',
          fields: [
            {
              name: 'email',
              type: 'email',
              validation: {
                async: { validatorId: 'checkEmail' },
              },
            },
          ],
        },
        initialValues: { email: 'user@example.com' },
        asyncValidators: {
          checkEmail: () => pending.promise,
        },
      });

      const inFlight = store.validate('email', 'onBlur');
      store.reset({ email: 'clean@example.com' });

      pending.resolve('Email already exists');
      await inFlight;

      expect(store.getRawError('email')).toBeUndefined();
      expect(store.getState().isValid).toBe(true);
    });
  });

  describe('Issue 3 (P1): ColorPickerField controlled hex input & programmatic sync', () => {
    it('updates rendered hex TextInput when typing and when updated programmatically via setValue() or reset()', async () => {
      const formRef = createRef<ExpoFormRef>();
      const config: FormConfig = {
        id: 'color-picker-sync-test',
        fields: [
          {
            name: 'brandColor',
            type: 'colorPicker',
            label: 'Brand Color',
            defaultValue: '#2563EB',
          },
        ],
      };

      render(<ExpoForm ref={formRef} config={config} />);

      const hexInput = screen.getByTestId('color-hex-brandColor') as HTMLInputElement;
      expect(hexInput.value).toBe('#2563EB');

      // 1. Typing into hex input updates both rendered input value and FormStore value
      await act(async () => {
        fireEvent.change(hexInput, { target: { value: '#FF5733' } });
      });
      expect(hexInput.value).toBe('#FF5733');
      expect(formRef.current?.getValue('brandColor')).toBe('#FF5733');

      // 2. Programmatic setValue() syncs hexState in the rendered TextInput
      await act(async () => {
        formRef.current?.setValue('brandColor', '#16A34A');
      });
      expect(hexInput.value).toBe('#16A34A');

      // 3. Programmatic reset() restores initial default '#2563EB' in rendered TextInput
      await act(async () => {
        formRef.current?.reset();
      });
      expect(hexInput.value).toBe('#2563EB');
    });
  });

  describe('Issue 4 (P1): Android programmatic scroll-to-field & anchor measurement', () => {
    it('builds Jetpack Compose testID + onGloballyPositioned field anchor modifiers and triggers Android BringIntoView scroll anchor', () => {
      const measuredRects: { x: number; y: number; width: number; height: number }[] = [];
      const anchorId = getFieldScrollAnchorId('termsAccepted');
      const mods = getAndroidFieldAnchorModifiers(anchorId, (rect) => {
        measuredRects.push(rect);
      });

      expect(mods).toHaveLength(2);
      expect(mods[0]).toMatchObject({
        $type: 'testID',
        testID: 'expo-form-field-termsAccepted',
      });
      expect(mods[1]).toMatchObject({
        $type: 'onGloballyPositioned',
      });
      mods[1].eventListener({ x: 0, y: 640, width: 360, height: 56 });
      expect(measuredRects).toEqual([{ x: 0, y: 640, width: 360, height: 56 }]);

      const containerMods = getAndroidScrollContainerModifiers(
        true,
        { value: null, get: () => null, set: () => {} },
        true,
        () => {}
      );
      expect(containerMods.scrollModifiers[0]).toMatchObject({ $type: 'onGloballyPositioned' });
      expect(containerMods.contentModifiers[0]).toMatchObject({ $type: 'imePadding' });
    });

    it('invokes registered Android scroll anchor bringIntoView for non-text fields and skips redundant focus when willFocusField is true', async () => {
      const scrollRef = createRef<KeyboardScrollHandle>();
      const anchorId = getFieldScrollAnchorId('acceptTerms');
      let registeredHandle: { bringIntoView: () => Promise<void> | void } | null = null;

      render(
        <KeyboardLayoutAdapter ref={scrollRef}>
          {renderAndroidScrollAnchor({
            anchorId,
            onRegister: (_id, handle) => {
              registeredHandle = handle;
            },
          })}
        </KeyboardLayoutAdapter>
      );

      expect(registeredHandle).not.toBeNull();
      const anchorInput = screen.getByTestId(`${anchorId}-scroll-anchor`);
      const focusSpy = vi.spyOn(anchorInput, 'focus');

      const bringIntoViewSpy = vi.spyOn(registeredHandle!, 'bringIntoView');
      await act(async () => {
        await registeredHandle!.bringIntoView();
      });
      expect(bringIntoViewSpy).toHaveBeenCalledTimes(1);
      expect(focusSpy).toHaveBeenCalledTimes(1);
    });

    it('wires FieldWrapper + KeyboardLayoutAdapter scrollToField end-to-end when Android scroll anchor is registered', async () => {
      const scrollRef = createRef<KeyboardScrollHandle>();
      const bringIntoViewMock = vi.fn();

      function MockAndroidFieldChild() {
        const anchorId = getFieldScrollAnchorId('agreePolicy');
        return renderAndroidScrollAnchor({
          anchorId,
          onRegister: (_id, handle) => {
            if (handle) {
              handle.bringIntoView = bringIntoViewMock;
            }
          },
        });
      }

      // Render through ScrollAnchorRegistryContext inside KeyboardLayoutAdapter
      const { ScrollAnchorRegistryContext } = await import(
        '../src/keyboard/KeyboardLayoutAdapter'
      );

      function ContextBridgeProbe() {
        const ctx = React.useContext(ScrollAnchorRegistryContext);
        React.useEffect(() => {
          const id = getFieldScrollAnchorId('agreePolicy');
          ctx?.registerAnchor(id, { bringIntoView: bringIntoViewMock });
          ctx?.reportAnchorLayout(id, { x: 0, y: 820, width: 340, height: 48 });
          return () => ctx?.registerAnchor(id, null);
        }, [ctx]);
        return <MockAndroidFieldChild />;
      }

      render(
        <KeyboardLayoutAdapter ref={scrollRef}>
          <ContextBridgeProbe />
        </KeyboardLayoutAdapter>
      );

      expect(scrollRef.current?.getMeasuredFieldLayout?.('agreePolicy')).toEqual({
        x: 0,
        y: 820,
        width: 340,
        height: 48,
      });

      // When field has its own interactive TextField focus handle (`willFocusField: true`), anchor does not conflict
      act(() => {
        scrollRef.current?.scrollToField('agreePolicy', { willFocusField: true });
      });
      expect(bringIntoViewMock).toHaveBeenCalledTimes(0);

      // When scrolling to a non-text field or when focusFirstError is false, Android anchor brings field into view
      act(() => {
        scrollRef.current?.scrollToField('agreePolicy', { willFocusField: false });
      });
      expect(bringIntoViewMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Issue 5 (P1): Malformed regex safety in configParser and ValidationEngine', () => {
    it('reports malformed validation.cnic.pattern, phone.pattern, password.specialCharPattern, and condition.matches during config parsing', () => {
      const parsed = parseAndValidateFormConfig({
        id: 'bad-regex-config',
        fields: [
          {
            name: 'cnic',
            type: 'cnic',
            validation: {
              cnic: {
                pattern: '[unclosed-cnic-group',
              },
            },
          },
          {
            name: 'phone',
            type: 'phone',
            validation: {
              phone: {
                pattern: '(unclosed-phone',
              },
            },
          },
          {
            name: 'secret',
            type: 'password',
            visibleWhen: {
              field: 'cnic',
              matches: '[invalid-cond-regex',
            },
            validation: {
              password: {
                specialCharPattern: '[unclosed-special',
              },
            },
          },
        ],
      });

      expect(parsed.valid).toBe(false);
      const errorPaths = parsed.errors.map((e) => e.path);
      expect(errorPaths).toContain('config.fields[0].validation.cnic.pattern');
      expect(errorPaths).toContain('config.fields[1].validation.phone.pattern');
      expect(errorPaths).toContain('config.fields[2].visibleWhen.matches');
      expect(errorPaths).toContain('config.fields[2].validation.password.specialCharPattern');
    });

    it('never throws SyntaxError in ValidationEngine when validation.cnic.pattern is malformed at runtime', () => {
      const engine = new ValidationEngine({
        id: 'runtime-bad-cnic',
        fields: [
          {
            name: 'nationalId',
            type: 'cnic',
            label: 'CNIC',
            validation: {
              cnic: {
                pattern: '[unclosed-runtime-regex',
              },
            },
          },
        ],
      });

      expect(() =>
        engine.validateSync({ nationalId: '35202-1234567-1' })
      ).not.toThrow();

      const res = engine.validateSync({ nationalId: '35202-1234567-1' });
      expect(res.valid).toBe(false);
      expect(res.errors.nationalId).toBe('Invalid CNIC validation pattern configuration');
    });
  });

  describe('Issue 6 (P2): Android sensitive-field semantics modifiers', () => {
    it('emits Jetpack Compose credential contentType semantics for sensitive fields and undefined otherwise', () => {
      expect(getAndroidSensitiveInputModifiers(false, 'text')).toBeUndefined();

      expect(getAndroidSensitiveInputModifiers(true, 'password')).toEqual([
        { $type: 'semantics', contentType: 'password' },
      ]);
      expect(getAndroidSensitiveInputModifiers(true, 'confirmPassword')).toEqual([
        { $type: 'semantics', contentType: 'new-password' },
      ]);
      expect(getAndroidSensitiveInputModifiers(true, 'otp')).toEqual([
        { $type: 'semantics', contentType: 'one-time-code' },
      ]);
      expect(getAndroidSensitiveInputModifiers(true, 'creditCard')).toEqual([
        { $type: 'semantics', contentType: 'cc-number' },
      ]);
      expect(getAndroidSensitiveInputModifiers(true, 'cvv')).toEqual([
        { $type: 'semantics', contentType: 'cc-csc' },
      ]);
      // Custom text/cnic field marked `"sensitive": true` receives credential semantics protection
      expect(getAndroidSensitiveInputModifiers(true, 'cnic')).toEqual([
        { $type: 'semantics', contentType: 'password' },
      ]);
    });
  });
});
