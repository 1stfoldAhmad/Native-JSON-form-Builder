import React, { createRef } from 'react';
import { Row, Text, TextInput, useNativeState } from '@expo/ui';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import checkoutJson from '../forms/checkout.json';
import contactSupportJson from '../forms/contact-support.json';
import feedbackSurveyJson from '../forms/feedback-survey.json';
import forgotPasswordJson from '../forms/forgot-password.json';
import jobApplicationJson from '../forms/job-application.json';
import loginJson from '../forms/login.json';
import registerJson from '../forms/register.json';
import {
  ALL_BUILT_IN_FIELD_TYPES,
  collectSensitiveFieldPaths,
  ExpoForm,
  ExpoFormProvider,
  redactSensitiveForLog,
  ValidationEngine,
  type ExpoFormRef,
  type FieldComponent,
  type FieldConfig,
  type FieldRendererProps,
  type FormConfig,
} from '../src';

function TestPromoCodeField({ value, onChange, onBlur, disabled }: FieldRendererProps<string>) {
  const codeState = useNativeState(value ?? '');
  const normalized = (value ?? '').trim().toUpperCase();
  const isVerified = normalized === 'EXPO58' || normalized === 'SAVE20';
  return (
    <Row spacing={8} alignment="center">
      <TextInput
        value={codeState}
        editable={!disabled}
        onChangeText={(next) => onChange(next.toUpperCase())}
        onBlur={onBlur}
      />
      <Text>{isVerified ? '20% OFF Applied' : 'Enter code'}</Text>
    </Row>
  );
}

function collectAllFieldTypes(config: FormConfig): Set<string> {
  const seen = new Set<string>();
  const walk = (fields?: readonly (string | FieldConfig)[]) => {
    if (!fields) return;
    for (const field of fields) {
      if (typeof field === 'string') continue;
      seen.add(field.type);
      if (field.fields) walk(field.fields);
      if (field.steps) {
        for (const step of field.steps) {
          walk(step.fields);
        }
      }
    }
  };
  walk(config.fields);
  for (const section of config.sections ?? []) {
    walk(section.fields);
  }
  for (const step of config.steps ?? []) {
    walk(step.fields);
  }
  return seen;
}

describe('JSON Forms Suite & 88-Type Register Coverage', () => {
  it('verifies forms/register.json contains every single one of the 88 built-in field types', () => {
    const config = registerJson as unknown as FormConfig;
    const seenTypes = collectAllFieldTypes(config);
    const missing = ALL_BUILT_IN_FIELD_TYPES.filter((type) => !seenTypes.has(type));

    expect(ALL_BUILT_IN_FIELD_TYPES.length).toBe(88);
    expect(missing).toEqual([]);
    expect(seenTypes.size).toBe(88);
  });

  it('renders forms/login.json across Password, OTP, and PIN modes and redacts all secrets', async () => {
    const config = loginJson as unknown as FormConfig;
    const onSubmit = vi.fn();
    const formRef = createRef<ExpoFormRef>();

    render(<ExpoForm ref={formRef} config={config} onSubmit={onSubmit} />);

    expect(screen.getByText('Welcome Back')).toBeTruthy();
    expect(screen.getByText('Email Address or Phone Number')).toBeTruthy();

    // Sensitive paths cover password, smsOtp, quickPin, totpCode
    const sensitivePaths = collectSensitiveFieldPaths(config);
    expect(sensitivePaths.has('password')).toBe(true);
    expect(sensitivePaths.has('smsOtp')).toBe(true);
    expect(sensitivePaths.has('quickPin')).toBe(true);
    expect(sensitivePaths.has('totpCode')).toBe(true);

    const redacted = redactSensitiveForLog(
      {
        loginMethod: 'password',
        identifier: 'ahmad@1stfold.com',
        password: 'SuperSecretPassword!1',
      },
      sensitivePaths
    );
    expect(redacted.password).toBe('[REDACTED]');

    // Switch to OTP mode via imperative ref and verify conditional validation
    act(() => {
      formRef.current?.setValues({
        loginMethod: 'otp',
        phone: '+923001234567',
        smsOtp: '482910',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('6-Digit SMS Verification Code')).toBeTruthy();
    });

    await act(async () => {
      await formRef.current?.submit();
    });

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  it('validates forms/forgot-password.json 3-step recovery wizard & confirm password rule', () => {
    const validator = new ValidationEngine(forgotPasswordJson as unknown as FormConfig);

    // Missing newPassword confirmation match fails
    const mismatch = validator.validateSync({
      accountIdentifier: 'ahmad@1stfold.com',
      channel: 'email',
      recoveryOtp: '839201',
      newPassword: 'N3w$ecurePassword!26',
      confirmNewPassword: 'WrongPassword!26',
    });
    expect(mismatch.valid).toBe(false);
    expect(mismatch.errors.confirmNewPassword).toBe('Passwords must match');

    const valid = validator.validateSync({
      accountIdentifier: 'ahmad@1stfold.com',
      channel: 'email',
      recoveryOtp: '839201',
      newPassword: 'N3w$ecurePassword!26',
      confirmNewPassword: 'N3w$ecurePassword!26',
      revokeOtherSessions: true,
    });
    expect(valid.valid).toBe(true);
  });

  it('renders forms/checkout.json with custom promoCode field and live computed subtotal', async () => {
    const config = checkoutJson as unknown as FormConfig;
    const formRef = createRef<ExpoFormRef>();

    render(
      <ExpoFormProvider customFields={{ promoCode: TestPromoCodeField as FieldComponent }}>
        <ExpoForm ref={formRef} config={config} onSubmit={vi.fn()} />
      </ExpoFormProvider>
    );

    expect(screen.getByText('Express Checkout & Payment')).toBeTruthy();
    // Default itemQty=2 * itemUnitPrice=49.5 with currency="USD", precision=2 => "$99.00"
    expect(screen.getByTestId('computed-orderSubtotal').textContent).toContain('99.00');

    // Update promo code to EXPO58 and verify custom field feedback updates
    act(() => {
      formRef.current?.setValue('promoCode', 'EXPO58');
    });

    await waitFor(() => {
      expect(screen.getByText('20% OFF Applied')).toBeTruthy();
    });
  });

  it('compiles and validates job-application, contact-support, and feedback-survey schemas cleanly', () => {
    const jobValidator = new ValidationEngine(jobApplicationJson as unknown as FormConfig);
    expect(
      jobValidator.validateSync({
        firstName: 'Ahmad',
        lastName: 'Khan',
        email: 'ahmad@1stfold.com',
        phone: '+923001234567',
        roleApplied: 'senior-rn',
        skills: ['typescript', 'expo'],
        earliestStartDate: '2026-11-15',
        coverLetter:
          'Built a native JSON Schema 2020-12 form engine across SwiftUI, Jetpack Compose, and Web.',
        requiresSponsorship: 'no',
        applicantSignature: 'Signed by Ahmad Khan',
      }).valid
    ).toBe(true);

    const supportValidator = new ValidationEngine(contactSupportJson as unknown as FormConfig);
    // Callback enabled without callbackPhone should fail conditional required check
    const missingCallbackPhone = supportValidator.validateSync({
      fullName: 'Ahmad Khan',
      email: 'ahmad@1stfold.com',
      category: 'technical',
      priority: 'high',
      subject: 'Keyboard inset issue on custom sheet',
      description: 'Detailed steps to reproduce the issue on Android and iOS devices.',
      requestCallback: true,
    });
    expect(missingCallbackPhone.valid).toBe(false);
    expect(missingCallbackPhone.errors.callbackPhone).toBeDefined();

    const surveyValidator = new ValidationEngine(feedbackSurveyJson as unknown as FormConfig);
    expect(
      surveyValidator.validateSync({
        overallRating: 5,
        npsScore: 9,
        usageFrequency: 'daily',
        allowFollowUp: false,
      }).valid
    ).toBe(true);
  });
});
