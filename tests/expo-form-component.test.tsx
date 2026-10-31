import React, { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Text } from '@expo/ui';
import { describe, expect, it, vi } from 'vitest';

import allFieldsShowcaseJson from '../forms/all-fields-showcase.json';
import kycWizardJson from '../forms/kyc-wizard.json';
import registerFormJson from '../forms/register.json';
import {
  ALL_BUILT_IN_FIELD_TYPES,
  ExpoForm,
  ExpoFormProvider,
  type ExpoFormRef,
  type FieldConfig,
  type FieldRendererProps,
  type FormConfig,
} from '../src';

describe('<ExpoForm /> Component Integration Tests', () => {
  it('renders forms/register.json declaratively with Urdu/English i18n and reveals business fields conditionally', async () => {
    const onSubmit = vi.fn();
    const formRef = createRef<ExpoFormRef>();

    const { rerender } = render(
      <ExpoForm
        ref={formRef}
        config={registerFormJson as unknown as FormConfig}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText('Create Your Account')).toBeTruthy();
    expect(screen.getByText('First Name')).toBeTruthy();
    expect(screen.getByText('Last Name')).toBeTruthy();
    expect(screen.getByText('Password')).toBeTruthy();
    expect(screen.getByText('Confirm Password')).toBeTruthy();

    // Organization is hidden when accountType === 'personal'
    expect(screen.queryByText('Organization Name')).toBeNull();

    // Switch accountType -> 'business' via imperative ref and verify conditional reveal + computed field
    await act(async () => {
      formRef.current?.setValue('accountType', 'business');
      formRef.current?.setValue('firstName', 'Ahmad');
      formRef.current?.setValue('lastName', 'Khan');
    });

    expect(screen.getByText('Organization Name')).toBeTruthy();
    expect(screen.getByText('Display Name (Auto-computed)')).toBeTruthy();
    expect(screen.getByText('Ahmad Khan')).toBeTruthy();

    // Re-render in Urdu (`locale="ur"`) and verify localized labels & RTL support
    rerender(
      <ExpoForm
        ref={formRef}
        locale="ur"
        config={registerFormJson as unknown as FormConfig}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText('اپنا اکاؤنٹ بنائیں')).toBeTruthy();
    expect(screen.getByText('پہلا نام')).toBeTruthy();
    expect(screen.getByText('پاس ورڈ')).toBeTruthy();
  });

  it('toggles password & confirmPassword visibility cleanly without losing typed characters and displays strength', async () => {
    const formRef = createRef<ExpoFormRef>();
    const config: FormConfig = {
      id: 'password-toggle-form',
      fields: [
        {
          name: 'password',
          type: 'password',
          label: 'Password',
          showStrengthIndicator: true,
          visibilityToggle: {
            showIcon: 'eye',
            hideIcon: 'eye-off',
            showLabel: 'Show password',
            hideLabel: 'Hide password',
          },
          required: true,
        },
        {
          name: 'confirmPassword',
          type: 'confirmPassword',
          label: 'Confirm Password',
          passwordField: 'password',
          visibilityToggle: {
            showIcon: 'eye',
            hideIcon: 'eye-off',
          },
          required: true,
        },
      ],
    };

    const { container } = render(<ExpoForm ref={formRef} config={config} />);

    const pwInput = container.querySelector(
      '[data-testid="input-password"]'
    ) as HTMLInputElement;
    expect(pwInput).toBeTruthy();
    expect(pwInput.getAttribute('type')).toBe('password');

    // Type password
    await act(async () => {
      fireEvent.change(pwInput, { target: { value: 'Sup3r$trong!99' } });
    });

    expect(formRef.current?.getValues().password).toBe('Sup3r$trong!99');
    expect(screen.getByText(/Password strength: Very Strong/i)).toBeTruthy();

    // Click native visibility toggle button
    const toggleBtn = container.querySelector(
      '[data-testid="password-toggle-password"]'
    ) as HTMLElement;
    expect(toggleBtn).toBeTruthy();

    await act(async () => {
      fireEvent.click(toggleBtn);
    });

    const revealedInput = container.querySelector(
      '[data-testid="input-password"]'
    ) as HTMLInputElement;
    expect(revealedInput.type).toBe('text');
    expect(formRef.current?.getValues().password).toBe('Sup3r$trong!99');

    // Toggle back to hidden
    await act(async () => {
      fireEvent.click(toggleBtn);
    });
    expect(
      (container.querySelector('[data-testid="input-password"]') as HTMLInputElement).getAttribute(
        'type'
      )
    ).toBe('password');
    expect(formRef.current?.getValues().password).toBe('Sup3r$trong!99');
  });

  it('blocks invalid submission, scrolls to first invalid field, maps server errors, and submits valid payload', async () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const onInvalid = vi.fn();
    const onSubmit = vi.fn(async (values, helpers) => {
      if (values.email === 'duplicate@1stfold.com') {
        helpers.setServerErrors({
          email: 'Server rejected: email already registered',
        });
        return;
      }
    });

    const formRef = createRef<ExpoFormRef>();
    const config: FormConfig = {
      id: 'submit-flow',
      fields: [
        { name: 'fullName', type: 'fullName', label: 'Full Name', required: true },
        { name: 'email', type: 'email', label: 'Email', required: true },
      ],
      submit: {
        label: 'Continue',
        showReset: true,
      },
    };

    render(
      <ExpoForm
        ref={formRef}
        config={config}
        onInvalid={onInvalid}
        onSubmit={onSubmit}
      />
    );

    // 1. Trigger submit while empty -> onInvalid fires & scrolls to first invalid field
    await act(async () => {
      await formRef.current?.submit();
    });

    expect(onInvalid).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Full Name is required')).toBeTruthy();
    expect(screen.getByText('Email is required')).toBeTruthy();
    expect(scrollSpy).toHaveBeenCalled();

    // 2. Populate fields with server-duplicate email -> server error mapped onto field
    await act(async () => {
      formRef.current?.setValue('fullName', 'Ahmad Khan');
      formRef.current?.setValue('email', 'duplicate@1stfold.com');
    });

    await act(async () => {
      await formRef.current?.submit();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Server rejected: email already registered')).toBeTruthy();

    // 3. Fix email and submit cleanly
    await act(async () => {
      formRef.current?.setValue('email', 'ahmad@1stfold.com');
    });

    await act(async () => {
      await formRef.current?.submit();
    });

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[1][0]).toEqual({
      fullName: 'Ahmad Khan',
      email: 'ahmad@1stfold.com',
    });

    // Imperative setError, clearErrors, and reset
    await act(async () => {
      formRef.current?.setError('fullName', 'Manual error');
    });
    expect(screen.getByText('Manual error')).toBeTruthy();

    await act(async () => {
      formRef.current?.clearErrors();
    });
    expect(screen.queryByText('Manual error')).toBeNull();

    await act(async () => {
      formRef.current?.reset();
    });
    expect(formRef.current?.getValues().fullName ?? '').toBe('');
  });

  it('navigates multi-step KYC wizard with per-step validation gating', async () => {
    const onStepChange = vi.fn();
    const formRef = createRef<ExpoFormRef>();

    render(
      <ExpoForm
        ref={formRef}
        config={kycWizardJson as unknown as FormConfig}
        onStepChange={onStepChange}
      />
    );

    expect(screen.getByText('1. Identity')).toBeTruthy();
    expect(screen.getByText('Email or Mobile Number')).toBeTruthy();

    // Attempting to advance while step 1 required fields are empty stays on step 0
    let moved = true;
    await act(async () => {
      moved = (await formRef.current?.nextStep()) ?? false;
    });
    expect(moved).toBe(false);
    expect(onStepChange).not.toHaveBeenCalled();

    // Populate step 1 fields and advance to step 2 (Financials)
    await act(async () => {
      formRef.current?.setValue('contactMethod', 'merchant@store.pk');
      formRef.current?.setValue('verificationOtp', '482910');
      formRef.current?.setValue('documentType', 'passport');
    });

    await act(async () => {
      moved = (await formRef.current?.nextStep()) ?? false;
    });
    expect(moved).toBe(true);
    expect(onStepChange).toHaveBeenCalledWith(1, 'financials');
    expect(screen.getByText('Estimated Bundle Value')).toBeTruthy();
    // 2 * 150 = $300.00 computed automatically!
    expect(screen.getByText('$300.00')).toBeTruthy();
  });

  it('renders forms/all-fields-showcase.json, custom registered fields, ExpoFormProvider, and all 88 built-in field types', async () => {
    // 1. Render showcase config with repeater, chips, rating, colorPicker, dateRange, coordinates
    const showcaseRender = render(
      <ExpoForm config={allFieldsShowcaseJson as unknown as FormConfig} />
    );
    expect(screen.getByText('Complete Field Catalogue Showcase')).toBeTruthy();
    expect(screen.getByText('Experience #1')).toBeTruthy();
    showcaseRender.unmount();

    // 2. Render custom field via ExpoFormProvider + hostMode="inherit"
    function CustomBadgeField({ field, value }: FieldRendererProps<string>) {
      return <Text>{`CustomBadge:${field.name}:${value ?? 'none'}`}</Text>;
    }

    const customRender = render(
      <ExpoFormProvider config={{ customFields: { customBadge: CustomBadgeField } }}>
        <ExpoForm
          hostMode="inherit"
          config={{
            id: 'custom-field-form',
            defaults: { badge: 'gold' },
            fields: [{ name: 'badge', type: 'customBadge', label: 'Member Tier' }],
          }}
        />
      </ExpoFormProvider>
    );
    expect(screen.getByText('CustomBadge:badge:gold')).toBeTruthy();
    customRender.unmount();

    // 3. Smoke-render ALL 88 built-in field types inside <ExpoForm /> without throwing
    const everyTypeFields: FieldConfig[] = ALL_BUILT_IN_FIELD_TYPES.map((type, idx) => {
      if (type === 'stepGroup') {
        return {
          id: `f_${idx}_${type}`,
          type,
          steps: [
            {
              id: 's1',
              title: 'Inline Step',
              fields: [{ name: 'inlineStepText', type: 'text', label: 'Inline Step Text' }],
            },
          ],
        };
      }
      if (
        type === 'section' ||
        type === 'fieldGroup' ||
        type === 'conditionalGroup' ||
        type === 'objectGroup' ||
        type === 'repeater'
      ) {
        return {
          id: `f_${idx}_${type}`,
          name: `group_${type}`,
          type,
          label: `Label ${type}`,
          fields: [{ name: 'childText', type: 'text', label: 'Child' }],
        };
      }
      return {
        id: `f_${idx}_${type}`,
        name: `field_${type}`,
        type,
        label: `Label ${type}`,
        options: [
          { label: 'Option A', value: 'a' },
          { label: 'Option B', value: 'b' },
        ],
        computed:
          type === 'computed'
            ? { operation: 'template', template: 'Computed OK' }
            : undefined,
      };
    });

    await waitFor(() => {
      const fullMount = render(
        <ExpoForm
          config={{
            id: 'all-88-types-smoke',
            fields: everyTypeFields,
          }}
        />
      );
      expect(fullMount.container).toBeTruthy();
      fullMount.unmount();
    });
  });
});
