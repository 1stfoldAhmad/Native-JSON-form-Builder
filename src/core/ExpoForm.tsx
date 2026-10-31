import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useColorScheme } from 'react-native';
import { Column, Text } from '@expo/ui';

import { useReducedMotion } from '../animations/AnimationAdapter';
import { defaultFieldRegistry } from '../fields/FieldRegistry';
import type { KeyboardScrollHandle } from '../keyboard/KeyboardLayoutAdapter';
import { FormRenderer } from '../renderer/FormRenderer';
import { FormStore, type ScrollToFieldOptions } from '../state/FormStore';
import { resolvePalette } from '../styles/StyleResolver';
import type {
  ExpoFormProps,
  ExpoFormRef,
  FormConfig,
  FormValues,
} from '../types';
import { BUILT_IN_DATA_SOURCES } from '../utils/countries';
import { isRTLLocale } from '../utils/formatting';
import { parseAndValidateFormConfig } from './configParser';
import { ActiveFormContext, useExpoFormGlobalConfig } from './context';
import { HostBoundary } from './HostBoundary';

/**
 * `<ExpoForm />` — Reusable, schema-driven native JSON form builder and renderer
 * built on `@expo/ui` (SwiftUI on iOS, Jetpack Compose on Android, universal Web)
 * and AJV JSON Schema 2020-12.
 */
export function ExpoForm<TValues extends FormValues = FormValues>({
  ref,
  config: rawConfig,
  hostMode = 'auto',
  initialValues,
  disabled,
  readOnly,
  loading,
  serverErrors,
  formErrors,
  locale: localeProp,
  colorScheme: colorSchemeProp,
  onChange,
  onFieldChange,
  onSubmit,
  onInvalid,
  onFocus,
  onBlur,
  onValidation,
  onFilesSelected,
  onReset,
  onStepChange,
  onConfigError,
  dataSources: localDataSources,
  asyncValidators: localAsyncValidators,
  actions: localActions,
  customFields: localCustomFields,
  renderIcon: localRenderIcon,
  storageAdapter: localStorageAdapter,
  testID,
}: ExpoFormProps<TValues>) {
  const globalCfg = useExpoFormGlobalConfig();
  const deviceScheme = useColorScheme();
  const reducedMotion = useReducedMotion();
  const scrollHandleRef = useRef<KeyboardScrollHandle | null>(null);

  const mergedCustomFields = useMemo(
    () => ({
      ...globalCfg.customFields,
      ...localCustomFields,
    }),
    [globalCfg.customFields, localCustomFields]
  );

  const mergedDataSources = useMemo(
    () => ({
      ...BUILT_IN_DATA_SOURCES,
      ...globalCfg.dataSources,
      ...localDataSources,
    }),
    [globalCfg.dataSources, localDataSources]
  );

  const mergedAsyncValidators = useMemo(
    () => ({
      ...globalCfg.asyncValidators,
      ...localAsyncValidators,
    }),
    [globalCfg.asyncValidators, localAsyncValidators]
  );

  const mergedActions = useMemo(
    () => ({
      ...globalCfg.actions,
      ...localActions,
    }),
    [globalCfg.actions, localActions]
  );

  const parsed = useMemo(
    () =>
      parseAndValidateFormConfig(
        rawConfig,
        (type) => Boolean(mergedCustomFields[type]) || defaultFieldRegistry.has(type)
      ),
    [rawConfig, mergedCustomFields]
  );

  useEffect(() => {
    if (parsed.issues.length > 0) {
      onConfigError?.(parsed.issues);
    }
  }, [parsed.issues, onConfigError]);

  const effectiveTheme = useMemo(
    () => parsed.config?.theme ?? globalCfg.theme,
    [parsed.config?.theme, globalCfg.theme]
  );

  const activeColorScheme: 'light' | 'dark' = useMemo(() => {
    if (colorSchemeProp) return colorSchemeProp;
    if (globalCfg.colorScheme) return globalCfg.colorScheme;
    if (effectiveTheme?.mode === 'dark') return 'dark';
    if (effectiveTheme?.mode === 'light') return 'light';
    return deviceScheme === 'dark' ? 'dark' : 'light';
  }, [colorSchemeProp, globalCfg.colorScheme, effectiveTheme?.mode, deviceScheme]);

  const activeLocale =
    localeProp ?? parsed.config?.i18n?.locale ?? globalCfg.locale ?? 'en';

  const isRTL = isRTLLocale(activeLocale, parsed.config?.i18n?.direction);

  const palette = useMemo(
    () => resolvePalette(effectiveTheme, activeColorScheme),
    [effectiveTheme, activeColorScheme]
  );

  const scrollToField = useCallback(
    (fieldPath: string, options?: ScrollToFieldOptions) => {
      scrollHandleRef.current?.scrollToField(fieldPath, options);
    },
    []
  );

  const fallbackConfig: FormConfig = parsed.config ?? {
    id: '__invalid_config__',
    fields: [],
  };

  const effectiveConfig: FormConfig = useMemo(
    () => ({
      ...fallbackConfig,
      theme: effectiveTheme,
    }),
    [fallbackConfig, effectiveTheme]
  );

  const callbacksObj = useMemo(
    () => ({
      onChange: onChange as ((v: FormValues, meta: { changedField: string; isDirty: boolean }) => void) | undefined,
      onFieldChange: onFieldChange as ((f: string, val: unknown, v: FormValues) => void) | undefined,
      onSubmit: onSubmit as ((v: FormValues, helpers: any) => void | Promise<void>) | undefined,
      onInvalid: onInvalid as ((errs: Record<string, string>, res: any, v: FormValues) => void) | undefined,
      onFocus,
      onBlur,
      onValidation,
      onFilesSelected,
      onReset: onReset as ((v: FormValues) => void) | undefined,
      onStepChange,
    }),
    [
      onChange,
      onFieldChange,
      onSubmit,
      onInvalid,
      onFocus,
      onBlur,
      onValidation,
      onFilesSelected,
      onReset,
      onStepChange,
    ]
  );

  const storeRef = useRef<FormStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = new FormStore({
      config: effectiveConfig,
      initialValues: initialValues as FormValues | undefined,
      callbacks: callbacksObj,
      asyncValidators: mergedAsyncValidators,
      actions: mergedActions,
      calculators: globalCfg.calculators,
      storageAdapter: localStorageAdapter ?? globalCfg.storageAdapter,
      locale: activeLocale,
      disabled,
      readOnly,
      onScrollToField: scrollToField,
    });
  }
  const store = storeRef.current;

  // Keep store synchronized with prop updates
  useEffect(() => {
    store.syncProps({
      config: effectiveConfig,
      callbacks: callbacksObj,
      asyncValidators: mergedAsyncValidators,
      actions: mergedActions,
      calculators: globalCfg.calculators,
      storageAdapter: localStorageAdapter ?? globalCfg.storageAdapter,
      locale: activeLocale,
      disabled,
      readOnly,
      onScrollToField: scrollToField,
    });
  }, [
    store,
    effectiveConfig,
    callbacksObj,
    mergedAsyncValidators,
    mergedActions,
    globalCfg.calculators,
    localStorageAdapter,
    globalCfg.storageAdapter,
    activeLocale,
    disabled,
    readOnly,
    scrollToField,
  ]);

  // Apply external server errors whenever `serverErrors` prop changes
  // Cancel debounced timers and in-flight async validations on unmount
  useEffect(() => {
    return () => {
      store.dispose();
    };
  }, [store]);

  // Apply external server errors whenever `serverErrors` prop changes
  useEffect(() => {
    if (serverErrors && Object.keys(serverErrors).length > 0) {
      store.setServerErrors(serverErrors);
    }
  }, [store, serverErrors]);

  // Expose full imperative ref handle (Section 9)
  useImperativeHandle(
    ref,
    (): ExpoFormRef<TValues> => ({
      submit: () => store.submit(),
      reset: (nextVals) => store.reset(nextVals as FormValues | undefined),
      validate: (fieldName) => store.validate(fieldName),
      getValues: () => store.getValues() as TValues,
      getValue: (fieldName) => store.getValue(fieldName),
      setValue: (fieldName, value, opts) => store.setValue(fieldName, value, opts),
      setValues: (vals, opts) => store.setValues(vals as FormValues, opts),
      setError: (fieldName, message) => store.setError(fieldName, message),
      setServerErrors: (errs, fErrs) => store.setServerErrors(errs, fErrs),
      clearErrors: (fieldName) => store.clearErrors(fieldName),
      focus: (fieldName) => store.focusField(fieldName),
      blur: (fieldName) => store.blurField(fieldName),
      getFieldState: (fieldName) => store.getFieldState(fieldName),
      getState: () => store.getState(),
      nextStep: () => store.nextStep(),
      previousStep: () => store.previousStep(),
      goToStep: (idx) => store.goToStep(idx),
      clearDraft: () => store.clearDraft(),
    }),
    [store]
  );

  const activeFormContextValue = useMemo(
    () => ({
      config: effectiveConfig,
      store,
      locale: activeLocale,
      isRTL,
      colorScheme: activeColorScheme,
      reducedMotion,
      dataSources: mergedDataSources,
      actions: mergedActions,
      customFields: mergedCustomFields,
      renderIcon: localRenderIcon ?? globalCfg.renderIcon,
      scrollToField,
    }),
    [
      effectiveConfig,
      store,
      activeLocale,
      isRTL,
      activeColorScheme,
      reducedMotion,
      mergedDataSources,
      mergedActions,
      mergedCustomFields,
      localRenderIcon,
      globalCfg.renderIcon,
      scrollToField,
    ]
  );

  // Report fatal schema/configuration errors clearly using native `@expo/ui` components
  if (parsed.hasFatalError) {
    return (
      <HostBoundary
        hostMode={hostMode}
        colorScheme={activeColorScheme}
        seedColor={palette.seedColor}
        isRTL={isRTL}
        testID={testID ?? 'expo-form-invalid-config'}>
        <Column
          spacing={8}
          style={{
            width: '100%',
            padding: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.error,
            backgroundColor: palette.errorBackground,
          }}>
          <Text
            textStyle={{
              fontSize: 16,
              fontWeight: '700',
              color: palette.error,
            }}>
            Invalid Form Configuration
          </Text>
          {parsed.issues.map((issue, idx) => (
            <Text
              key={`${issue.path}-${idx}`}
              textStyle={{
                fontSize: 13,
                color: palette.error,
              }}>
              {`• ${issue.path}: ${issue.message}`}
            </Text>
          ))}
        </Column>
      </HostBoundary>
    );
  }

  const warningIssues = parsed.issues.filter((i) => i.severity === 'warning');

  return (
    <HostBoundary
      hostMode={hostMode}
      colorScheme={activeColorScheme}
      seedColor={palette.seedColor}
      isRTL={isRTL}
      matchContents={false}
      useViewportSizeMeasurement>
      <ActiveFormContext.Provider value={activeFormContextValue}>
        <FormRenderer
          externalDisabled={disabled}
          externalReadOnly={readOnly}
          externalLoading={loading}
          externalFormErrors={formErrors}
          configIssues={warningIssues}
          testID={testID}
          onBindScrollHandle={(h) => {
            scrollHandleRef.current = h;
          }}
        />
      </ActiveFormContext.Provider>
    </HostBoundary>
  );
}
