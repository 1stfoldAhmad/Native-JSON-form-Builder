import { useCallback, useMemo } from 'react';
import { Row, Text } from '@expo/ui';

import { collectFieldDependencies, isFieldVisible } from '../conditions/evaluator';
import { useActiveForm } from '../core/context';
import { defaultFieldRegistry } from '../fields/FieldRegistry';
import { resolveFieldReturnKeyType } from '../keyboard/KeyboardLayoutAdapter';
import { useFormSelector } from '../state/useFormSelector';
import { resolveFieldStyles } from '../styles/StyleResolver';
import type { FieldConfig, FocusableFieldHandle } from '../types';
import { isEmptyValue } from '../utils/deepPath';
import { FieldWrapper } from './FieldWrapper';

export interface FieldNodeRendererProps {
  field: FieldConfig;
  pathPrefix?: string;
  isLastEditable?: boolean;
  externalDisabled?: boolean;
  externalReadOnly?: boolean;
}

/**
 * Fine-grained reactive field node subscriber & dispatcher.
 * Re-renders ONLY when this field's own path or its declared condition/cross-field dependencies change.
 */
export function FieldNodeRenderer({
  field,
  pathPrefix = '',
  isLastEditable = false,
  externalDisabled = false,
  externalReadOnly = false,
}: FieldNodeRendererProps) {
  const { store, config, locale, isRTL, colorScheme, customFields } = useActiveForm();

  const fieldPath = useMemo(() => {
    const rawName = field.name ?? field.id ?? `structural_${field.type}`;
    return pathPrefix && field.name ? `${pathPrefix}.${field.name}` : rawName;
  }, [field.name, field.id, field.type, pathPrefix]);

  const watchedPaths = useMemo(() => {
    const deps = collectFieldDependencies(field, {
      namedConditions: config.conditions,
      repeaterTemplatePrefix: pathPrefix || undefined,
    });
    return field.name ? [fieldPath, ...deps] : deps;
  }, [field, fieldPath, config.conditions, pathPrefix]);

  const slice = useFormSelector(store, watchedPaths, (s) => {
    const valuesRef = s.getValuesRef();
    const runtime = s.getFieldState(fieldPath, field);
    const visible =
      field.type === 'hidden'
        ? false
        : field.name
          ? runtime.visible
          : isFieldVisible(field, valuesRef, {
              namedConditions: config.conditions,
              rowPrefix: pathPrefix || undefined,
            });
    const rawError = s.getRawError(fieldPath);
    const submitStatus = s.getState().submitStatus;
    return {
      visible,
      value: runtime.value,
      dirty: runtime.dirty,
      touched: runtime.touched,
      focused: runtime.focused,
      validating: runtime.validating,
      enabled: runtime.enabled,
      readOnly: Boolean(runtime.readOnly),
      required: runtime.required,
      error: runtime.error,
      rawError,
      files: runtime.files,
      isSubmitting: submitStatus === 'loading',
    };
  });

  const handleFocus = useCallback(() => {
    store.handleFocus(fieldPath);
  }, [store, fieldPath]);

  const handleBlur = useCallback(() => {
    store.handleBlur(fieldPath);
  }, [store, fieldPath]);

  const handleChange = useCallback(
    (nextVal: unknown) => {
      store.setValue(fieldPath, nextVal);
    },
    [store, fieldPath]
  );

  const handleSubmitEditing = useCallback(() => {
    store.handleSubmitEditing(fieldPath, field.nextField);
  }, [store, fieldPath, field.nextField]);

  const registerFocusHandle = useCallback(
    (handle: FocusableFieldHandle | null) => {
      store.registerFocusHandle(fieldPath, handle);
    },
    [store, fieldPath]
  );

  const getFieldValue = useCallback((p: string) => store.getValue(p), [store]);
  const setFieldValue = useCallback((p: string, v: unknown) => store.setValue(p, v), [store]);

  if (!slice.visible) {
    return null;
  }

  const disabled = externalDisabled || !slice.enabled || slice.isSubmitting;
  const readOnly =
    externalReadOnly || slice.readOnly || Boolean(field.readOnly) || Boolean(config.readOnly);

  const resolvedStyles = resolveFieldStyles(
    config.style,
    config.theme,
    field.style,
    {
      focused: slice.focused,
      disabled,
      invalid: Boolean(slice.error),
      valid: slice.touched && !slice.rawError && !isEmptyValue(slice.value),
      touched: slice.touched,
      selected: !isEmptyValue(slice.value) && slice.value !== false,
      loading: slice.validating || slice.isSubmitting,
    },
    colorScheme,
    isRTL,
    config.accessibility?.minTouchTargetSize ?? 44
  );

  const customComponent = customFields[field.type];
  const regEntry = defaultFieldRegistry.get(field.type);
  const Component = customComponent ?? regEntry?.component;

  if (!Component) {
    return (
      <Row
        style={{
          padding: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#F59E0B',
          backgroundColor: '#FFFBEB',
        }}>
        <Text textStyle={{ fontSize: 13, color: '#B45309' }}>
          {`Unsupported field type "${field.type}" (${fieldPath}). Register a custom renderer via registerField() or customFields prop.`}
        </Text>
      </Row>
    );
  }

  const returnKeyType = resolveFieldReturnKeyType(
    field.returnKeyType,
    field.type,
    isLastEditable,
    config.keyboard
  );

  const renderedControl = (
    <Component
      field={field}
      fieldPath={fieldPath}
      value={slice.value}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onSubmitEditing={handleSubmitEditing}
      error={slice.error}
      rawError={slice.rawError}
      disabled={disabled}
      readOnly={readOnly}
      required={slice.required}
      focused={slice.focused}
      touched={slice.touched}
      dirty={slice.dirty}
      validating={slice.validating}
      returnKeyType={returnKeyType}
      files={slice.files}
      onFilesChange={(nextFiles) =>
        store.setFieldFiles(
          fieldPath,
          nextFiles,
          field.type === 'multipleFiles' ||
            field.type === 'multipleImages' ||
            Boolean(field.upload?.multiple)
        )
      }
      styles={resolvedStyles}
      locale={locale}
      isRTL={isRTL}
      registerFocusHandle={registerFocusHandle}
      getFieldValue={getFieldValue}
      setFieldValue={setFieldValue}
    />
  );

  if (regEntry?.isStructural && !customComponent) {
    return renderedControl;
  }

  const suppressTopLabel = field.type === 'checkbox' || field.type === 'switch';

  return (
    <FieldWrapper
      field={field}
      fieldPath={fieldPath}
      required={slice.required}
      focused={slice.focused}
      validating={slice.validating}
      error={slice.error}
      styles={resolvedStyles}
      suppressLabel={suppressTopLabel}>
      {renderedControl}
    </FieldWrapper>
  );
}
