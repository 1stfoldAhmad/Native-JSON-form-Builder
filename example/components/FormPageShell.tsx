import React, { useMemo, useRef, useState } from 'react';
import { Button, Column, Host, Row, ScrollView, Spacer, Text } from '@expo/ui';

import {
  collectSensitiveFieldPaths,
  ExpoForm,
  ExpoFormProvider,
  redactSensitiveForLog,
  type ExpoFormRef,
  type FormConfig,
  type FormValues,
} from '@/components/expo-form';
import { useAppSettings } from './AppSettingsContext';
import { DEMO_ASYNC_VALIDATORS, DEMO_CUSTOM_FIELDS } from './CustomFields';

export interface QuickPresetAction {
  label: string;
  values: FormValues;
}

export interface FormPageShellProps {
  config: FormConfig;
  badgeText?: string;
  helperNote?: string;
  presets?: readonly QuickPresetAction[];
}

/**
 * Shared screen shell used by every Drawer form route in `example/app/`.
 * Wraps `<ExpoForm />` inside a screen-level `@expo/ui` `<Host>` + `<ScrollView>`,
 * adds 1-tap demo prefill presets, a live JSON config viewer toggle,
 * and a redacted submission payload inspector.
 */
export function FormPageShell({
  config,
  badgeText,
  helperNote,
  presets = [],
}: FormPageShellProps) {
  const formRef = useRef<ExpoFormRef>(null);
  const { locale, colorScheme } = useAppSettings();
  const [showJsonConfig, setShowJsonConfig] = useState(false);
  const [submittedPayload, setSubmittedPayload] = useState<string | null>(null);
  const [invalidSummary, setInvalidSummary] = useState<string | null>(null);

  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#09090B' : '#F1F5F9';
  const barBg = isDark ? '#18181B' : '#FFFFFF';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textMuted = isDark ? '#A1A1AA' : '#64748B';
  const borderCol = isDark ? '#27272A' : '#E2E8F0';

  // Delegate outer scrolling to the page ScrollView so toolbar + banners + form scroll as one unit
  const embeddedConfig = useMemo<FormConfig>(
    () => ({
      ...config,
      scroll: {
        ...config.scroll,
        enabled: false,
      },
    }),
    [config]
  );

  const handleSubmit = async (values: FormValues) => {
    setInvalidSummary(null);
    await new Promise((resolve) => setTimeout(resolve, 280));
    const sensitive = collectSensitiveFieldPaths(config);
    const redacted = redactSensitiveForLog(values, sensitive);
    setSubmittedPayload(JSON.stringify(redacted, null, 2));
  };

  return (
    <Host
      colorScheme={colorScheme}
      seedColor="#2563EB"
      style={{ flex: 1, width: '100%', backgroundColor: pageBg }}
    >
      <ExpoFormProvider
        locale={locale}
        colorScheme={colorScheme}
        asyncValidators={DEMO_ASYNC_VALIDATORS}
        customFields={DEMO_CUSTOM_FIELDS}
      >
        <ScrollView direction="vertical" style={{ width: '100%', height: '100%' }}>
          <Column
            alignment="center"
            style={{
              width: '100%',
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 36,
              backgroundColor: pageBg,
            }}
          >
            <Column spacing={12} style={{ width: '100%' }}>
              {/* Developer Action & Preset Toolbar */}
              <Column
                spacing={8}
                style={{
                  width: '100%',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: borderCol,
                  backgroundColor: barBg,
                }}
              >
                <Row spacing={8} alignment="center" style={{ width: '100%' }}>
                  {badgeText ? (
                    <Text
                      textStyle={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: '#2563EB',
                      }}
                    >
                      {badgeText}
                    </Text>
                  ) : null}
                  {helperNote ? (
                    <Text textStyle={{ fontSize: 12, color: textMuted }}>{helperNote}</Text>
                  ) : null}
                  <Spacer />
                  <Button
                    variant="outlined"
                    onPress={() => setShowJsonConfig((prev) => !prev)}
                    style={{ height: 34, borderRadius: 8, paddingHorizontal: 10 }}
                  >
                    <Text textStyle={{ fontSize: 12, fontWeight: '600', color: textPrimary }}>
                      {showJsonConfig ? 'Hide JSON' : 'Inspect JSON'}
                    </Text>
                  </Button>
                </Row>

                <Row spacing={8} alignment="center" style={{ width: '100%' }}>
                  {presets.map((preset) => (
                    <Button
                      key={preset.label}
                      variant="text"
                      onPress={() => {
                        setSubmittedPayload(null);
                        setInvalidSummary(null);
                        formRef.current?.setValues(preset.values, { shouldValidate: true });
                      }}
                    >
                      <Text textStyle={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>
                        {preset.label}
                      </Text>
                    </Button>
                  ))}
                  <Button
                    variant="text"
                    onPress={() => {
                      void formRef.current?.validate();
                    }}
                  >
                    <Text textStyle={{ fontSize: 12, fontWeight: '600', color: textPrimary }}>
                      Validate All
                    </Text>
                  </Button>
                  <Button
                    variant="text"
                    onPress={() => {
                      setSubmittedPayload(null);
                      setInvalidSummary(null);
                      formRef.current?.reset();
                    }}
                  >
                    <Text textStyle={{ fontSize: 12, fontWeight: '600', color: textMuted }}>
                      Reset
                    </Text>
                  </Button>
                </Row>
              </Column>

              {/* Optional Live JSON Config Inspector */}
              {showJsonConfig ? (
                <Column
                  spacing={6}
                  style={{
                    width: '100%',
                    padding: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: borderCol,
                    backgroundColor: barBg,
                  }}
                >
                  <Text textStyle={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>
                    {`JSON Config Preview — id: "${config.id}"`}
                  </Text>
                  <Text textStyle={{ fontSize: 11, color: textPrimary }}>
                    {JSON.stringify(config, null, 2).slice(0, 2400) +
                      (JSON.stringify(config, null, 2).length > 2400 ? '\n  ... (truncated)' : '')}
                  </Text>
                </Column>
              ) : null}

              {/* Validation Error Summary */}
              {invalidSummary ? (
                <Column
                  spacing={4}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#DC2626',
                    backgroundColor: isDark ? '#3F1518' : '#FEF2F2',
                  }}
                >
                  <Text textStyle={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>
                    {invalidSummary}
                  </Text>
                </Column>
              ) : null}

              {/* Submitted Payload Inspector (Sensitive Fields Redacted) */}
              {submittedPayload ? (
                <Column
                  spacing={6}
                  style={{
                    width: '100%',
                    padding: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#16A34A',
                    backgroundColor: isDark ? '#052E16' : '#F0FDF4',
                  }}
                >
                  <Row spacing={8} alignment="center" style={{ width: '100%' }}>
                    <Text textStyle={{ fontSize: 13, fontWeight: '700', color: '#16A34A' }}>
                      Submitted Payload (Sensitive Values Redacted)
                    </Text>
                    <Spacer />
                    <Button variant="text" onPress={() => setSubmittedPayload(null)}>
                      <Text textStyle={{ fontSize: 12, color: '#16A34A' }}>Dismiss</Text>
                    </Button>
                  </Row>
                  <Text textStyle={{ fontSize: 11, color: textPrimary }}>{submittedPayload}</Text>
                </Column>
              ) : null}

              {/* Declarative JSON-Driven Native Form */}
              <ExpoForm
                ref={formRef}
                hostMode="inherit"
                config={embeddedConfig}
                onSubmit={handleSubmit}
                onInvalid={(errors) => {
                  const count = Object.keys(errors).length;
                  setInvalidSummary(
                    `Please fix ${count} validation error${count === 1 ? '' : 's'} highlighted below.`
                  );
                }}
              />
            </Column>
          </Column>
        </ScrollView>
      </ExpoFormProvider>
    </Host>
  );
}
