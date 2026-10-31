import React, { useMemo, useRef, useState } from 'react';
import {
  Button,
  Collapsible,
  Column,
  Host,
  Row,
  ScrollView,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';

import {
  collectSensitiveFieldPaths,
  createStarterFormTemplate,
  defaultFieldRegistry,
  ExpoForm,
  ExpoFormProvider,
  parseFormJson,
  redactSensitiveForLog,
  serializeFormConfig,
  type ExpoFormRef,
  type FieldConfig,
  type FormConfig,
  type FormValues,
  type StarterTemplateKind,
} from '@/components/expo-form';
import { useAppSettings } from '@/components/AppSettingsContext';
import { DEMO_ASYNC_VALIDATORS, DEMO_CUSTOM_FIELDS } from '@/components/CustomFields';
import customStarterJson from '../../forms/custom-form.json';

const INITIAL_JSON = JSON.stringify(customStarterJson, null, 2);

interface QuickFieldSnippet {
  label: string;
  create: (index: number) => FieldConfig;
}

const QUICK_FIELD_SNIPPETS: readonly QuickFieldSnippet[] = [
  {
    label: '+ Text',
    create: (n) => ({
      name: `customText${n}`,
      type: 'text',
      label: `Custom Text ${n}`,
      placeholder: 'Enter text...',
      required: false,
    }),
  },
  {
    label: '+ Email',
    create: (n) => ({
      name: `workEmail${n}`,
      type: 'email',
      label: `Email ${n}`,
      placeholder: 'user@company.com',
      required: true,
    }),
  },
  {
    label: '+ Password',
    create: (n) => ({
      name: `secretPassword${n}`,
      type: 'password',
      label: `Password ${n}`,
      visibilityToggle: true,
      showStrengthIndicator: true,
      required: true,
      validation: { minLength: 8 },
    }),
  },
  {
    label: '+ Phone',
    create: (n) => ({
      name: `mobilePhone${n}`,
      type: 'phone',
      label: `Phone Number ${n}`,
      defaultCountry: 'PK',
    }),
  },
  {
    label: '+ Select',
    create: (n) => ({
      name: `choice${n}`,
      type: 'select',
      label: `Select Option ${n}`,
      options: [
        { label: 'Option A', value: 'a' },
        { label: 'Option B', value: 'b' },
        { label: 'Option C', value: 'c' },
      ],
    }),
  },
  {
    label: '+ Date',
    create: (n) => ({
      name: `targetDate${n}`,
      type: 'date',
      label: `Target Date ${n}`,
    }),
  },
  {
    label: '+ Switch',
    create: (n) => ({
      name: `toggleFlag${n}`,
      type: 'switch',
      label: `Enable Feature ${n}`,
      defaultValue: true,
    }),
  },
  {
    label: '+ Slider',
    create: (n) => ({
      name: `scoreSlider${n}`,
      type: 'slider',
      label: `Slider Value ${n}`,
      min: 0,
      max: 100,
      step: 5,
      defaultValue: 50,
    }),
  },
  {
    label: '+ Rating',
    create: (n) => ({
      name: `starRating${n}`,
      type: 'rating',
      label: `Star Rating ${n}`,
      maxRating: 5,
      defaultValue: 4,
    }),
  },
  {
    label: '+ File Upload',
    create: (n) => ({
      name: `attachment${n}`,
      type: 'document',
      label: `Upload Document ${n}`,
      upload: {
        maxFileSize: 5242880,
        allowedMimeTypes: ['application/pdf', 'image/*'],
      },
    }),
  },
];

export default function CustomFormBuilderPage() {
  const formRef = useRef<ExpoFormRef>(null);
  const { locale, colorScheme } = useAppSettings();
  const [jsonText, setJsonText] = useState<string>(INITIAL_JSON);
  const editorState = useNativeState<string>(INITIAL_JSON);
  const [editorExpanded, setEditorExpanded] = useState(true);
  const [fieldCounter, setFieldCounter] = useState(1);
  const [submittedPayload, setSubmittedPayload] = useState<string | null>(null);

  const isDark = colorScheme === 'dark';
  const pageBg = isDark ? '#09090B' : '#F1F5F9';
  const cardBg = isDark ? '#18181B' : '#FFFFFF';
  const codeBg = isDark ? '#0F172A' : '#F8FAFC';
  const borderCol = isDark ? '#27272A' : '#E2E8F0';
  const textPrimary = isDark ? '#F8FAFC' : '#0F172A';
  const textSecondary = isDark ? '#A1A1AA' : '#64748B';

  const parsedResult = useMemo(
    () =>
      parseFormJson(jsonText, {
        isRegisteredFieldType: (type) =>
          Boolean(DEMO_CUSTOM_FIELDS[type]) || defaultFieldRegistry.has(type),
      }),
    [jsonText]
  );

  // When valid, embed without nested ScrollView so the outer page scrolls as a single unit;
  // when invalid, pass raw jsonText directly so <ExpoForm /> displays its native diagnostic card.
  const previewConfig: FormConfig | string = useMemo(() => {
    if (!parsedResult.config) return jsonText;
    return {
      ...parsedResult.config,
      scroll: {
        ...parsedResult.config.scroll,
        enabled: false,
      },
    };
  }, [parsedResult.config, jsonText]);

  const applyProgrammaticJson = (nextJson: string) => {
    setSubmittedPayload(null);
    setJsonText(nextJson);
    editorState.set(nextJson);
  };

  const handleLoadTemplate = (kind: StarterTemplateKind | 'starterFile') => {
    if (kind === 'starterFile') {
      applyProgrammaticJson(INITIAL_JSON);
      return;
    }
    const cfg = createStarterFormTemplate(kind);
    applyProgrammaticJson(serializeFormConfig(cfg));
  };

  const handleFormatJson = () => {
    try {
      const obj = JSON.parse(jsonText);
      applyProgrammaticJson(JSON.stringify(obj, null, 2));
    } catch {
      // Keep current text so user can see the JSON syntax diagnostic below
    }
  };

  const handleAppendField = (snippet: QuickFieldSnippet) => {
    if (!parsedResult.config) return;
    const nextField = snippet.create(fieldCounter);
    setFieldCounter((c) => c + 1);

    const draft = JSON.parse(JSON.stringify(parsedResult.config)) as FormConfig;
    if (Array.isArray(draft.sections) && draft.sections.length > 0) {
      const lastIdx = draft.sections.length - 1;
      const lastSec = draft.sections[lastIdx];
      const nextSections = [...draft.sections];
      nextSections[lastIdx] = {
        ...lastSec,
        fields: [...lastSec.fields, nextField],
      };
      applyProgrammaticJson(serializeFormConfig({ ...draft, sections: nextSections }));
      return;
    }

    if (Array.isArray(draft.steps) && draft.steps.length > 0) {
      const lastIdx = draft.steps.length - 1;
      const lastStep = draft.steps[lastIdx];
      const nextSteps = [...draft.steps];
      nextSteps[lastIdx] = {
        ...lastStep,
        fields: [...lastStep.fields, nextField],
      };
      applyProgrammaticJson(serializeFormConfig({ ...draft, steps: nextSteps }));
      return;
    }

    const nextFields = [...(draft.fields ?? []), nextField];
    applyProgrammaticJson(serializeFormConfig({ ...draft, fields: nextFields }));
  };

  const handleSubmit = async (values: FormValues) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const sensitive = parsedResult.config
      ? collectSensitiveFieldPaths(parsedResult.config)
      : new Set<string>();
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
            spacing={14}
            style={{
              width: '100%',
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 40,
              backgroundColor: pageBg,
            }}
          >
            {/* Header & Standard Templates Card */}
            <Column
              spacing={10}
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: borderCol,
                backgroundColor: cardBg,
              }}
            >
              <Row spacing={8} alignment="center" style={{ width: '100%' }}>
                <Text textStyle={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>
                  CUSTOM FORM.JSON STUDIO • LIVE GENERATOR
                </Text>
                <Spacer />
                <Text
                  textStyle={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: parsedResult.valid ? '#16A34A' : '#DC2626',
                  }}
                >
                  {parsedResult.valid
                    ? '✓ Valid ExpoForm Standard'
                    : `✕ ${parsedResult.errors.length} Standard Error${parsedResult.errors.length === 1 ? '' : 's'}`}
                </Text>
              </Row>

              <Text textStyle={{ fontSize: 13, color: textSecondary, lineHeight: 19 }}>
                Write or paste any custom form.json following our standard (schema/expo-form.schema.json), or insert fields below — ExpoForm validates your JSON against the standard and generates the native form live.
              </Text>

              {/* Starter Template Switcher */}
              <Row spacing={8} alignment="center" style={{ width: '100%' }}>
                <Text textStyle={{ fontSize: 12, fontWeight: '600', color: textPrimary }}>
                  Templates:
                </Text>
                <Button variant="outlined" onPress={() => handleLoadTemplate('starterFile')}>
                  <Text textStyle={{ fontSize: 12, color: textPrimary }}>Custom Starter</Text>
                </Button>
                <Button variant="outlined" onPress={() => handleLoadTemplate('blank')}>
                  <Text textStyle={{ fontSize: 12, color: textPrimary }}>Minimal</Text>
                </Button>
                <Button variant="outlined" onPress={() => handleLoadTemplate('login')}>
                  <Text textStyle={{ fontSize: 12, color: textPrimary }}>Login</Text>
                </Button>
                <Button variant="outlined" onPress={() => handleLoadTemplate('contact')}>
                  <Text textStyle={{ fontSize: 12, color: textPrimary }}>Contact</Text>
                </Button>
                <Button variant="outlined" onPress={() => handleLoadTemplate('wizard')}>
                  <Text textStyle={{ fontSize: 12, color: textPrimary }}>2-Step Wizard</Text>
                </Button>
              </Row>

              {/* 1-Tap Append Standard Field Snippets */}
              {parsedResult.valid ? (
                <Column spacing={6} style={{ width: '100%' }}>
                  <Text textStyle={{ fontSize: 12, fontWeight: '600', color: textPrimary }}>
                    Insert Standard Field into JSON:
                  </Text>
                  <ScrollView direction="horizontal" showsIndicators={false} style={{ width: '100%' }}>
                    <Row spacing={6} alignment="center">
                      {QUICK_FIELD_SNIPPETS.map((snippet) => (
                        <Button
                          key={snippet.label}
                          variant="text"
                          onPress={() => handleAppendField(snippet)}
                        >
                          <Text textStyle={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>
                            {snippet.label}
                          </Text>
                        </Button>
                      ))}
                    </Row>
                  </ScrollView>
                </Column>
              ) : null}
            </Column>

            {/* Collapsible Custom form.json Editor */}
            <Column
              spacing={10}
              style={{
                width: '100%',
                padding: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: borderCol,
                backgroundColor: cardBg,
              }}
            >
              <Collapsible
                isOpen={editorExpanded}
                onOpenChange={setEditorExpanded}
                label="1. Author Custom form.json (ExpoForm Standard)"
                labelStyle={{ fontSize: 15, fontWeight: '700', color: textPrimary }}
              >
                <Column spacing={10} style={{ width: '100%', paddingTop: 8 }}>
                  <Row spacing={8} alignment="center" style={{ width: '100%' }}>
                    <Text textStyle={{ fontSize: 12, color: textSecondary }}>
                      {`$schema: "native-json-form-builder/schema/expo-form.schema.json"`}
                    </Text>
                    <Spacer />
                    <Button variant="outlined" onPress={handleFormatJson}>
                      <Text textStyle={{ fontSize: 12, fontWeight: '600', color: textPrimary }}>
                        Format JSON
                      </Text>
                    </Button>
                  </Row>

                  <TextInput
                    value={editorState}
                    multiline
                    numberOfLines={16}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={(next) => {
                      setSubmittedPayload(null);
                      setJsonText(next);
                    }}
                    style={{
                      width: '100%',
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: parsedResult.valid ? borderCol : '#DC2626',
                      backgroundColor: codeBg,
                    }}
                    textStyle={{
                      fontSize: 12,
                      color: textPrimary,
                      lineHeight: 18,
                    }}
                    testID="custom-form-json-editor"
                  />

                  {/* Standard Compliance Warnings / Errors */}
                  {parsedResult.issues.length > 0 ? (
                    <Column
                      spacing={4}
                      style={{
                        width: '100%',
                        padding: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: parsedResult.valid ? '#D97706' : '#DC2626',
                        backgroundColor: isDark ? '#27171A' : '#FEF2F2',
                      }}
                    >
                      {parsedResult.issues.map((issue, idx) => (
                        <Text
                          key={`${issue.path}-${idx}`}
                          textStyle={{
                            fontSize: 12,
                            color: issue.severity === 'error' ? '#DC2626' : '#D97706',
                          }}
                        >
                          {`[${issue.severity.toUpperCase()}] ${issue.path}: ${issue.message}`}
                        </Text>
                      ))}
                    </Column>
                  ) : null}
                </Column>
              </Collapsible>
            </Column>

            {/* Submitted Payload Output */}
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
                    Submitted Custom Form Output (Sensitive Values Redacted)
                  </Text>
                  <Spacer />
                  <Button variant="text" onPress={() => setSubmittedPayload(null)}>
                    <Text textStyle={{ fontSize: 12, color: '#16A34A' }}>Dismiss</Text>
                  </Button>
                </Row>
                <Text textStyle={{ fontSize: 11, color: textPrimary }}>{submittedPayload}</Text>
              </Column>
            ) : null}

            {/* Live Native Form Generated from Custom form.json */}
            <Column spacing={8} style={{ width: '100%' }}>
              <Row spacing={8} alignment="center" style={{ width: '100%' }}>
                <Text textStyle={{ fontSize: 15, fontWeight: '700', color: textPrimary }}>
                  2. Live Generated Native Form
                </Text>
                <Spacer />
                <Button
                  variant="text"
                  onPress={() => {
                    void formRef.current?.validate();
                  }}
                >
                  <Text textStyle={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>
                    Validate
                  </Text>
                </Button>
                <Button
                  variant="text"
                  onPress={() => {
                    setSubmittedPayload(null);
                    formRef.current?.reset();
                  }}
                >
                  <Text textStyle={{ fontSize: 12, fontWeight: '600', color: textSecondary }}>
                    Reset
                  </Text>
                </Button>
              </Row>

              <ExpoForm
                ref={formRef}
                hostMode="inherit"
                config={previewConfig}
                onSubmit={handleSubmit}
              />
            </Column>
          </Column>
        </ScrollView>
      </ExpoFormProvider>
    </Host>
  );
}
