import React, { useMemo, useRef, useState } from 'react';
import { Button, Column, Host, Row, Spacer, Text, TextInput, useNativeState } from '@expo/ui';

import {
  collectSensitiveFieldPaths,
  ExpoForm,
  ExpoFormProvider,
  redactSensitiveForLog,
  type AsyncFieldValidator,
  type ExpoFormRef,
  type FieldRendererProps,
  type FormConfig,
  type FormValues,
} from '@/components/expo-form';
import allFieldsShowcase from '../forms/all-fields-showcase.json';
import kycWizard from '../forms/kyc-wizard.json';
import registerForm from '../forms/register.json';

type DemoTab = 'register' | 'wizard' | 'catalogue';

/**
 * Example custom field registered via ExpoFormProvider without modifying core library code.
 */
function PromoCodeField({
  value,
  onChange,
  onBlur,
  disabled,
  styles,
}: FieldRendererProps<string>) {
  const codeState = useNativeState(value ?? '');
  const isVerified = (value ?? '').toUpperCase() === 'EXPO58';

  return (
    <Row spacing={8} alignment="center" style={{ width: '100%' }}>
      <TextInput
        value={codeState}
        placeholder="Try EXPO58"
        editable={!disabled}
        autoCapitalize="characters"
        style={{ ...styles.inputStyle, width: '70%' }}
        textStyle={styles.inputTextStyle}
        onChangeText={(next) => onChange(next.toUpperCase())}
        onBlur={onBlur}
      />
      <Text
        textStyle={{
          fontSize: 12,
          fontWeight: '600',
          color: isVerified ? '#16A34A' : '#64748B',
        }}
      >
        {isVerified ? '20% OFF Applied' : 'Optional promo'}
      </Text>
    </Row>
  );
}

const DEMO_ASYNC_VALIDATORS: Record<string, AsyncFieldValidator> = {
  checkUsernameAvailable: async ({ value }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const reserved = new Set(['admin', 'root', 'support', 'taken']);
    return reserved.has(String(value).toLowerCase())
      ? 'That username is reserved — try another handle'
      : true;
  },
  checkEmailAvailable: async ({ value }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return String(value).toLowerCase() === 'taken@example.com'
      ? 'An account with taken@example.com already exists'
      : true;
  },
};

export default function App() {
  const formRef = useRef<ExpoFormRef>(null);
  const [activeTab, setActiveTab] = useState<DemoTab>('register');
  const [locale, setLocale] = useState<'en' | 'ur'>('en');
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light');
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);

  const activeConfig = useMemo<FormConfig>(() => {
    if (activeTab === 'wizard') return kycWizard as unknown as FormConfig;
    if (activeTab === 'catalogue') {
      const base = allFieldsShowcase as unknown as FormConfig;
      return {
        ...base,
        sections: [
          ...(base.sections ?? []),
          {
            id: 'custom-extension',
            title: 'Custom Registered Field',
            variant: 'card',
            fields: [
              {
                name: 'promoCode',
                type: 'promoCode',
                label: 'Partner Promo Code',
              },
            ],
          },
        ],
      };
    }
    return registerForm as unknown as FormConfig;
  }, [activeTab]);

  const handleFormSubmit = async (values: FormValues) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const sensitive = collectSensitiveFieldPaths(activeConfig);
    const safePayload = redactSensitiveForLog(values, sensitive);
    setLastSubmitted(JSON.stringify(safePayload, null, 2));
  };

  const bg = colorScheme === 'dark' ? '#09090B' : '#F8FAFC';
  const cardBg = colorScheme === 'dark' ? '#18181B' : '#FFFFFF';
  const fg = colorScheme === 'dark' ? '#F8FAFC' : '#0F172A';

  return (
    <Host
      colorScheme={colorScheme}
      seedColor="#2563EB"
      style={{ flex: 1, width: '100%', backgroundColor: bg }}
    >
      <ExpoFormProvider
        locale={locale}
        colorScheme={colorScheme}
        asyncValidators={DEMO_ASYNC_VALIDATORS}
        customFields={{ promoCode: PromoCodeField }}
      >
        <Column spacing={12} style={{ width: '100%', paddingTop: 12, backgroundColor: bg }}>
          {/* Top Demo Toolbar */}
          <Column
            spacing={10}
            style={{
              width: '100%',
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: cardBg,
            }}
          >
            <Row spacing={8} alignment="center" style={{ width: '100%' }}>
              <Text textStyle={{ fontSize: 17, fontWeight: '700', color: fg }}>
                ExpoForm SDK 58
              </Text>
              <Spacer />
              <Button
                variant="outlined"
                onPress={() => setLocale((prev) => (prev === 'en' ? 'ur' : 'en'))}
              >
                <Text>{locale === 'en' ? 'اردو (RTL)' : 'English'}</Text>
              </Button>
              <Button
                variant="outlined"
                onPress={() =>
                  setColorScheme((prev) => (prev === 'light' ? 'dark' : 'light'))
                }
              >
                <Text>{colorScheme === 'light' ? 'Dark' : 'Light'}</Text>
              </Button>
            </Row>

            <Row spacing={8} style={{ width: '100%' }}>
              {(
                [
                  { id: 'register', label: 'Register' },
                  { id: 'wizard', label: 'KYC Wizard' },
                  { id: 'catalogue', label: 'All Fields' },
                ] as const
              ).map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'filled' : 'outlined'}
                  onPress={() => {
                    setLastSubmitted(null);
                    setActiveTab(tab.id);
                  }}
                >
                  <Text>{tab.label}</Text>
                </Button>
              ))}
            </Row>

            {activeTab === 'register' ? (
              <Row spacing={8} style={{ width: '100%' }}>
                <Button
                  variant="text"
                  onPress={() => {
                    formRef.current?.setValues({
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
                      acceptTerms: true,
                    });
                  }}
                >
                  <Text>Prefill Demo</Text>
                </Button>
                <Button variant="text" onPress={() => void formRef.current?.validate()}>
                  <Text>Validate All</Text>
                </Button>
                <Button variant="text" onPress={() => formRef.current?.reset()}>
                  <Text>Reset</Text>
                </Button>
              </Row>
            ) : null}
          </Column>

          {/* Declarative JSON-Driven Native Form */}
          <ExpoForm
            key={activeTab}
            ref={formRef}
            hostMode="inherit"
            config={activeConfig}
            onSubmit={handleFormSubmit}
          />

          {/* Redacted Submission Inspector */}
          {lastSubmitted ? (
            <Column
              spacing={6}
              style={{
                width: '100%',
                padding: 16,
                backgroundColor: cardBg,
              }}
            >
              <Text textStyle={{ fontSize: 13, fontWeight: '700', color: '#16A34A' }}>
                Submitted Payload (Sensitive Fields Redacted):
              </Text>
              <Text textStyle={{ fontSize: 12, color: fg }}>{lastSubmitted}</Text>
            </Column>
          ) : null}
        </Column>
      </ExpoFormProvider>
    </Host>
  );
}
