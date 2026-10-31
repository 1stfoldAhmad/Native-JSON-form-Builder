import { useEffect, useRef } from 'react';
import {
  Button,
  Column,
  Row,
  Slider,
  Spacer,
  Text,
  TextInput,
  type TextInputRef,
} from '@expo/ui';

import { useActiveForm } from '../core/context';
import { useNativeTextState } from '../state/useNativeTextState';
import type { FieldRendererProps } from '../types';
import {
  formatNumberValue,
  parseNumericInput,
  resolveLocalizedText,
} from '../utils/formatting';

/**
 * Unified native renderer for all 11 Category B Numeric & Financial fields:
 * `number`, `integer`, `decimal`, `currency`, `percentage`, `age`, `quantity`,
 * `price`, `phoneExtension`, `slider`, and `rangeSlider`.
 */
export function NumericFieldRenderer(props: FieldRendererProps) {
  if (props.field.type === 'slider') {
    return <SliderFieldRenderer {...props} />;
  }
  if (props.field.type === 'rangeSlider') {
    return <RangeSliderFieldRenderer {...props} />;
  }
  return <NumericTextInputFieldRenderer {...props} />;
}

function SliderFieldRenderer({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
  locale,
}: FieldRendererProps) {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? field.format?.step ?? 1;
  const numVal = typeof value === 'number' && !Number.isNaN(value) ? value : min;

  const formatted = formatNumberValue(
    numVal,
    {
      ...field.format,
      precision: field.precision ?? field.format?.precision,
      prefix: field.prefix ?? field.format?.prefix,
      suffix: field.suffix ?? field.format?.suffix,
    },
    locale
  );

  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Row alignment="center" style={{ width: '100%' }}>
        <Text textStyle={styles.descriptionStyle}>{String(min)}</Text>
        <Spacer flexible />
        <Text
          testID={`slider-value-${fieldPath}`}
          textStyle={{
            ...styles.labelStyle,
            fontWeight: '700',
            color: styles.tintColor,
          }}>
          {formatted}
        </Text>
        <Spacer flexible />
        <Text textStyle={styles.descriptionStyle}>{String(max)}</Text>
      </Row>
      <Slider
        value={numVal}
        min={min}
        max={max}
        step={step}
        disabled={disabled || readOnly}
        testID={field.testID ?? `slider-${fieldPath}`}
        onValueChange={(next) => {
          onChange(next);
          onBlur();
        }}
      />
    </Column>
  );
}

function RangeSliderFieldRenderer({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
  locale,
}: FieldRendererProps) {
  const min = field.min ?? 0;
  const max = field.max ?? 100;
  const step = field.step ?? field.format?.step ?? 1;

  const tuple: [number, number] =
    Array.isArray(value) && value.length === 2
      ? [Number(value[0]) || min, Number(value[1]) || max]
      : [min, max];

  const [low, high] = tuple;

  const fmtLow = formatNumberValue(
    low,
    { ...field.format, prefix: field.prefix, suffix: field.suffix },
    locale
  );
  const fmtHigh = formatNumberValue(
    high,
    { ...field.format, prefix: field.prefix, suffix: field.suffix },
    locale
  );

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      <Row alignment="center" style={{ width: '100%' }}>
        <Text textStyle={styles.descriptionStyle}>{`Min: ${fmtLow}`}</Text>
        <Spacer flexible />
        <Text textStyle={styles.descriptionStyle}>{`Max: ${fmtHigh}`}</Text>
      </Row>
      <Slider
        value={low}
        min={min}
        max={max}
        step={step}
        disabled={disabled || readOnly}
        testID={`range-slider-min-${fieldPath}`}
        onValueChange={(nextLow) => {
          const clampedLow = Math.min(nextLow, high);
          onChange([clampedLow, high]);
          onBlur();
        }}
      />
      <Slider
        value={high}
        min={min}
        max={max}
        step={step}
        disabled={disabled || readOnly}
        testID={`range-slider-max-${fieldPath}`}
        onValueChange={(nextHigh) => {
          const clampedHigh = Math.max(nextHigh, low);
          onChange([low, clampedHigh]);
          onBlur();
        }}
      />
    </Column>
  );
}

function NumericTextInputFieldRenderer({
  field,
  fieldPath,
  value,
  onFocus,
  onBlur,
  onSubmitEditing,
  disabled,
  readOnly,
  returnKeyType,
  styles,
  locale,
  registerFocusHandle,
}: FieldRendererProps) {
  const { store, config } = useActiveForm();
  const inputRef = useRef<TextInputRef>(null);

  useEffect(() => {
    registerFocusHandle({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    });
    return () => registerFocusHandle(null);
  }, [registerFocusHandle]);

  const integerOnly =
    field.type === 'integer' ||
    field.type === 'age' ||
    field.type === 'quantity' ||
    field.type === 'phoneExtension';

  const precision =
    field.precision ??
    field.format?.precision ??
    (field.type === 'currency' || field.type === 'price' ? 2 : undefined);

  const prefix =
    field.prefix ??
    field.currencySymbol ??
    field.format?.currencySymbol ??
    field.format?.prefix ??
    (field.type === 'currency' || field.type === 'price'
      ? (field.currency === 'PKR' || config.i18n?.currency === 'PKR' ? 'Rs.' : '$')
      : field.type === 'phoneExtension'
        ? 'ext.'
        : undefined);

  const suffix =
    field.suffix ??
    field.format?.suffix ??
    (field.type === 'percentage' ? '%' : undefined);

  const showStepper = field.showStepper ?? field.type === 'quantity';
  const step = field.step ?? field.format?.step ?? 1;

  const { nativeState, handleChangeText } = useNativeTextState({
    store,
    fieldPath,
    parseToStoreValue: (str) => parseNumericInput(str, { integerOnly, precision }),
    formatFromStoreValue: (val) =>
      val === undefined || val === null || val === '' ? '' : String(val),
  });

  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ??
    (integerOnly ? '0' : '0.00');

  const handleBlurClamp = () => {
    const current = typeof value === 'number' ? value : undefined;
    if (current !== undefined && field.format?.clampOnBlur) {
      let clamped = current;
      if (field.min !== undefined && clamped < field.min) clamped = field.min;
      if (field.max !== undefined && clamped > field.max) clamped = field.max;
      if (clamped !== current) {
        store.setValue(fieldPath, clamped);
      }
    }
    onBlur();
  };

  if (readOnly) {
    const numVal = typeof value === 'number' ? value : parseNumericInput(String(value ?? ''));
    const display =
      numVal !== undefined
        ? formatNumberValue(
            numVal,
            {
              ...field.format,
              precision,
              prefix,
              suffix,
              currencyCode: field.currency ?? field.format?.currencyCode,
            },
            locale
          )
        : '—';
    return (
      <Row style={styles.inputStyle} alignment="center">
        <Text textStyle={styles.inputTextStyle}>{display}</Text>
      </Row>
    );
  }

  const adjustByStep = (delta: number) => {
    const cur = typeof value === 'number' && !Number.isNaN(value) ? value : (field.min ?? 0);
    let next = cur + delta;
    if (precision !== undefined) {
      const factor = 10 ** precision;
      next = Math.round(next * factor) / factor;
    }
    if (field.min !== undefined && next < field.min) next = field.min;
    if (field.max !== undefined && next > field.max) next = field.max;
    store.setValue(fieldPath, next, { shouldValidate: true, shouldTouch: true });
  };

  const hasAddons = Boolean(prefix || suffix || showStepper);

  const inputNode = (
    <TextInput
      ref={inputRef}
      value={nativeState}
      placeholder={placeholder}
      placeholderTextColor={styles.placeholderColor}
      editable={!disabled}
      keyboardType={integerOnly ? 'number-pad' : 'decimal-pad'}
      returnKeyType={returnKeyType}
      cursorColor={styles.cursorColor}
      selectionColor={styles.selectionColor}
      testID={field.testID ?? `numeric-input-${fieldPath}`}
      style={
        hasAddons
          ? {
              width: showStepper ? '56%' : '82%',
              height: styles.inputStyle.height,
              paddingHorizontal: 4,
              backgroundColor: 'transparent',
              borderWidth: 0,
            }
          : styles.inputStyle
      }
      textStyle={styles.inputTextStyle}
      onChangeText={handleChangeText}
      onFocus={onFocus}
      onBlur={handleBlurClamp}
      onSubmitEditing={() => onSubmitEditing()}
    />
  );

  if (!hasAddons) {
    return inputNode;
  }

  return (
    <Row alignment="center" spacing={6} style={styles.inputStyle}>
      {prefix ? (
        <Text textStyle={{ ...styles.descriptionStyle, fontSize: 14, fontWeight: '600' }}>
          {prefix}
        </Text>
      ) : null}

      {inputNode}

      <Spacer flexible />

      {suffix ? (
        <Text textStyle={{ ...styles.descriptionStyle, fontSize: 14, fontWeight: '600' }}>
          {suffix}
        </Text>
      ) : null}

      {showStepper ? (
        <Row alignment="center" spacing={4}>
          <Button
            variant="outlined"
            label="−"
            disabled={disabled || (field.min !== undefined && Number(value ?? 0) <= field.min)}
            testID={`stepper-dec-${fieldPath}`}
            onPress={() => adjustByStep(-step)}
            style={{ height: 34, width: 36, paddingHorizontal: 0 }}
          />
          <Button
            variant="outlined"
            label="+"
            disabled={disabled || (field.max !== undefined && Number(value ?? 0) >= field.max)}
            testID={`stepper-inc-${fieldPath}`}
            onPress={() => adjustByStep(step)}
            style={{ height: 34, width: 36, paddingHorizontal: 0 }}
          />
        </Row>
      ) : null}
    </Row>
  );
}
