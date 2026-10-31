import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  Button,
  Checkbox,
  Column,
  Row,
  Spacer,
  Switch,
  Text,
  TextInput,
  useNativeState,
  type TextInputRef,
} from '@expo/ui';
import { SegmentedControl } from '@expo/ui/community/segmented-control';

import { useActiveForm } from '../core/context';
import { ManagedRNHostView } from '../core/HostBoundary';
import { renderNativePlatformColorPicker } from '../core/nativePlatformBridge';
import { FormIcon } from '../icons/IconRenderer';
import { NativeSelectPicker } from '../pickers/NativeSelectPicker';
import { useFieldOptions } from '../pickers/optionsLoader';
import { SearchablePicker } from '../pickers/SearchablePicker';
import type { FieldRendererProps } from '../types';
import { deepEqual } from '../utils/deepPath';
import { resolveLocalizedText } from '../utils/formatting';

const DEFAULT_COLOR_PRESETS = [
  '#171717',
  '#2563EB',
  '#16A34A',
  '#DC2626',
  '#D97706',
  '#9333EA',
  '#0891B2',
  '#EC4899',
];

/**
 * Unified native renderer for all 14 Category C Selection & Choice fields:
 * `checkbox`, `checkboxGroup`, `switch`, `radioGroup`, `select`, `searchableSelect`,
 * `multiSelect`, `searchableMultiSelect`, `autocomplete`, `chips`, `tagInput`,
 * `segmentedControl`, `rating`, and `colorPicker`.
 */
export function SelectionFieldRenderer(props: FieldRendererProps) {
  switch (props.field.type) {
    case 'checkbox':
      return <SingleCheckboxField {...props} />;
    case 'checkboxGroup':
      return <CheckboxGroupField {...props} />;
    case 'switch':
      return <SwitchField {...props} />;
    case 'radioGroup':
      return <RadioGroupField {...props} />;
    case 'select':
      return (
        <NativeSelectPicker
          {...(props as FieldRendererProps<string | number | undefined>)}
        />
      );
    case 'searchableSelect':
      return <SearchablePicker {...props} multiple={false} />;
    case 'multiSelect':
    case 'searchableMultiSelect':
      return <SearchablePicker {...props} multiple />;
    case 'autocomplete':
      return <AutocompleteField {...props} />;
    case 'chips':
      return <ChipsField {...props} />;
    case 'tagInput':
      return <TagInputField {...props} />;
    case 'segmentedControl':
      return <SegmentedControlField {...props} />;
    case 'rating':
      return <RatingField {...props} />;
    case 'colorPicker':
      return <ColorPickerField {...props} />;
    default:
      return (
        <NativeSelectPicker
          {...(props as FieldRendererProps<string | number | undefined>)}
        />
      );
  }
}

function SingleCheckboxField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  locale,
}: FieldRendererProps) {
  const { config } = useActiveForm();
  const label = resolveLocalizedText(field.label, locale, config.i18n?.translations) ?? '';
  return (
    <Checkbox
      value={Boolean(value)}
      label={label}
      disabled={disabled || readOnly}
      testID={field.testID ?? `checkbox-${fieldPath}`}
      onValueChange={(checked) => {
        onChange(checked);
        onBlur();
      }}
    />
  );
}

function SwitchField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  locale,
}: FieldRendererProps) {
  const { config } = useActiveForm();
  const label = resolveLocalizedText(field.label, locale, config.i18n?.translations) ?? '';
  return (
    <Switch
      value={Boolean(value)}
      label={label}
      disabled={disabled || readOnly}
      testID={field.testID ?? `switch-${fieldPath}`}
      onValueChange={(checked) => {
        onChange(checked);
        onBlur();
      }}
    />
  );
}

function CheckboxGroupField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  locale,
  getFieldValue,
}: FieldRendererProps) {
  const { dataSources } = useActiveForm();
  const { options } = useFieldOptions({
    field,
    dataSources,
    getFieldValue,
    locale,
  });

  const selected: unknown[] = Array.isArray(value) ? value : [];
  const maxSelections = field.maxSelections ?? field.validation?.maxItems;

  return (
    <Column spacing={10} style={{ width: '100%' }}>
      {options.map((opt) => {
        const checked = selected.some((v) => deepEqual(v, opt.value));
        const atLimit = maxSelections !== undefined && !checked && selected.length >= maxSelections;
        return (
          <Checkbox
            key={String(opt.value)}
            value={checked}
            label={opt.label}
            disabled={disabled || readOnly || Boolean(opt.disabled) || atLimit}
            testID={`checkbox-group-${fieldPath}-${String(opt.value)}`}
            onValueChange={(nextChecked) => {
              const next = nextChecked
                ? [...selected, opt.value]
                : selected.filter((v) => !deepEqual(v, opt.value));
              onChange(next);
              onBlur();
            }}
          />
        );
      })}
    </Column>
  );
}

function RadioGroupField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
  locale,
  getFieldValue,
}: FieldRendererProps) {
  const { dataSources } = useActiveForm();
  const { options } = useFieldOptions({
    field,
    dataSources,
    getFieldValue,
    locale,
  });

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      {options.map((opt) => {
        const selected = deepEqual(value, opt.value);
        return (
          <Button
            key={String(opt.value)}
            variant={selected ? 'filled' : 'outlined'}
            disabled={disabled || readOnly || Boolean(opt.disabled)}
            testID={`radio-${fieldPath}-${String(opt.value)}`}
            onPress={() => {
              onChange(opt.value);
              onBlur();
            }}
            style={{
              width: '100%',
              height: 46,
              borderRadius: 10,
              paddingHorizontal: 14,
            }}>
            <Row alignment="center" spacing={10} style={{ width: '100%' }}>
              <Text
                textStyle={{
                  fontSize: 15,
                  fontWeight: selected ? '600' : '400',
                  color: selected ? '#FFFFFF' : (styles.inputTextStyle.color ?? '#0F172A'),
                }}>
                {`${selected ? '◉' : '◯'}  ${opt.label}`}
              </Text>
              <Spacer flexible />
              {opt.description ? (
                <Text
                  textStyle={{
                    fontSize: 12,
                    color: selected ? '#E2E8F0' : (styles.descriptionStyle.color ?? '#64748B'),
                  }}>
                  {opt.description}
                </Text>
              ) : null}
            </Row>
          </Button>
        );
      })}
    </Column>
  );
}

function AutocompleteField({
  field,
  fieldPath,
  value,
  onChange,
  onFocus,
  onBlur,
  disabled,
  readOnly,
  styles,
  locale,
  getFieldValue,
  registerFocusHandle,
}: FieldRendererProps) {
  const { store, dataSources, config } = useActiveForm();
  const inputRef = useRef<TextInputRef>(null);
  const initialStr = value == null ? '' : String(value);
  const nativeText = useNativeState<string>(initialStr);
  const [query, setQuery] = useState(initialStr);
  const [openSuggestions, setOpenSuggestions] = useState(false);

  const externalVersion = store.getExternalVersion(fieldPath);
  const lastSyncedRef = useRef<number>(externalVersion);

  useEffect(() => {
    registerFocusHandle({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    });
    return () => registerFocusHandle(null);
  }, [registerFocusHandle]);

  useEffect(() => {
    if (lastSyncedRef.current !== externalVersion) {
      lastSyncedRef.current = externalVersion;
      const nextStr = value == null ? '' : String(value);
      if (nativeText.get() !== nextStr) {
        nativeText.set(nextStr);
      }
      setQuery(nextStr);
    }
  }, [externalVersion, value, nativeText]);

  const { options } = useFieldOptions({
    field,
    dataSources,
    getFieldValue,
    locale,
    searchQuery: query,
  });

  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ??
    'Start typing...';

  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <TextInput
        ref={inputRef}
        value={nativeText}
        placeholder={placeholder}
        placeholderTextColor={styles.placeholderColor}
        editable={!disabled && !readOnly}
        style={styles.inputStyle}
        textStyle={styles.inputTextStyle}
        testID={field.testID ?? `autocomplete-${fieldPath}`}
        onFocus={() => {
          setOpenSuggestions(true);
          onFocus();
        }}
        onBlur={() => {
          onBlur();
        }}
        onChangeText={(txt) => {
          if (nativeText.get() !== txt) {
            nativeText.set(txt);
          }
          setQuery(txt);
          setOpenSuggestions(true);
          onChange(txt);
        }}
      />
      {openSuggestions && query.trim().length > 0 && options.length > 0 ? (
        <Column
          spacing={4}
          style={{
            width: '100%',
            padding: 6,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: styles.inputStyle.borderColor ?? '#CBD5E1',
            backgroundColor: styles.inputStyle.backgroundColor ?? '#FFFFFF',
          }}>
          {options.slice(0, 6).map((opt) => (
            <Button
              key={String(opt.value)}
              variant="text"
              testID={`autocomplete-suggestion-${fieldPath}-${String(opt.value)}`}
              onPress={() => {
                const chosen = String(opt.label);
                nativeText.set(chosen);
                setQuery(chosen);
                onChange(opt.value);
                setOpenSuggestions(false);
                onBlur();
              }}
              style={{ width: '100%', height: 38, paddingHorizontal: 10 }}>
              <Row alignment="center" style={{ width: '100%' }}>
                <Text textStyle={styles.inputTextStyle}>{opt.label}</Text>
                <Spacer flexible />
              </Row>
            </Button>
          ))}
        </Column>
      ) : null}
    </Column>
  );
}

function ChipsField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  locale,
  getFieldValue,
}: FieldRendererProps) {
  const { dataSources } = useActiveForm();
  const { options } = useFieldOptions({
    field,
    dataSources,
    getFieldValue,
    locale,
  });

  const isMulti = field.maxSelections !== 1;
  const selectedList: unknown[] = Array.isArray(value)
    ? value
    : value !== undefined && value !== ''
      ? [value]
      : [];

  return (
    <Row spacing={8} alignment="center" style={{ width: '100%' }}>
      {options.map((opt) => {
        const active = selectedList.some((v) => deepEqual(v, opt.value));
        return (
          <Button
            key={String(opt.value)}
            variant={active ? 'filled' : 'outlined'}
            label={opt.flag ? `${opt.flag} ${opt.label}` : opt.label}
            disabled={disabled || readOnly || Boolean(opt.disabled)}
            testID={`chip-${fieldPath}-${String(opt.value)}`}
            onPress={() => {
              if (!isMulti) {
                onChange(active ? '' : opt.value);
              } else {
                const next = active
                  ? selectedList.filter((v) => !deepEqual(v, opt.value))
                  : [...selectedList, opt.value];
                onChange(next);
              }
              onBlur();
            }}
            style={{
              height: 36,
              borderRadius: 18,
              paddingHorizontal: 14,
            }}
          />
        );
      })}
    </Row>
  );
}

function TagInputField({
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
  const { config } = useActiveForm();
  const tags: string[] = Array.isArray(value) ? value.map(String) : [];
  const draftState = useNativeState<string>('');
  const [draftText, setDraftText] = useState('');

  const addTag = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return;
    if (tags.includes(cleaned)) {
      draftState.set('');
      setDraftText('');
      return;
    }
    if (field.maxSelections && tags.length >= field.maxSelections) return;
    onChange([...tags, cleaned]);
    draftState.set('');
    setDraftText('');
    onBlur();
  };

  const removeTag = (target: string) => {
    onChange(tags.filter((t) => t !== target));
    onBlur();
  };

  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ??
    'Add tag...';

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      {tags.length > 0 ? (
        <Row spacing={6} alignment="center" style={{ width: '100%' }}>
          {tags.map((tag) => (
            <Button
              key={tag}
              variant="outlined"
              label={disabled || readOnly ? tag : `${tag}  ✕`}
              disabled={disabled || readOnly}
              testID={`tag-pill-${fieldPath}-${tag}`}
              onPress={() => removeTag(tag)}
              style={{ height: 32, borderRadius: 16, paddingHorizontal: 12 }}
            />
          ))}
        </Row>
      ) : null}

      {!readOnly ? (
        <Row spacing={8} alignment="center" style={{ width: '100%' }}>
          <TextInput
            value={draftState}
            placeholder={placeholder}
            placeholderTextColor={styles.placeholderColor}
            editable={!disabled}
            returnKeyType="done"
            style={{ ...styles.inputStyle, width: '76%' }}
            textStyle={styles.inputTextStyle}
            testID={`tag-input-${fieldPath}`}
            onChangeText={setDraftText}
            onSubmitEditing={(txt) => addTag(txt)}
          />
          <Button
            variant="filled"
            label="Add"
            disabled={disabled || !draftText.trim()}
            testID={`tag-add-${fieldPath}`}
            onPress={() => addTag(draftText)}
            style={{ height: styles.inputStyle.height ?? 48, borderRadius: 10 }}
          />
        </Row>
      ) : null}
    </Column>
  );
}

function SegmentedControlField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
  locale,
  getFieldValue,
}: FieldRendererProps) {
  const { dataSources, colorScheme } = useActiveForm();
  const { options } = useFieldOptions({
    field,
    dataSources,
    getFieldValue,
    locale,
  });

  const labels = options.map((o) => o.label);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => deepEqual(o.value, value))
  );

  return (
    <ManagedRNHostView matchContents={{ vertical: true }}>
      <SegmentedControl
        values={labels}
        selectedIndex={selectedIndex}
        enabled={!disabled && !readOnly}
        tintColor={styles.tintColor}
        appearance={colorScheme}
        testID={field.testID ?? `segmented-${fieldPath}`}
        onChange={(event) => {
          const idx = event.nativeEvent.selectedSegmentIndex;
          const opt = options[idx];
          if (opt) {
            onChange(opt.value);
            onBlur();
          }
        }}
      />
    </ManagedRNHostView>
  );
}

function RatingField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
}: FieldRendererProps) {
  const { renderIcon } = useActiveForm();
  const maxRating = field.maxRating ?? field.max ?? 5;
  const current = typeof value === 'number' ? value : Number(value) || 0;

  return (
    <Row spacing={6} alignment="center">
      {Array.from({ length: maxRating }, (_, idx) => {
        const starVal = idx + 1;
        const filled = current >= starVal;
        return (
          <Button
            key={starVal}
            variant="text"
            disabled={disabled || readOnly}
            testID={`rating-star-${fieldPath}-${starVal}`}
            onPress={() => {
              onChange(current === starVal && !field.required ? 0 : starVal);
              onBlur();
            }}
            style={{ height: 42, width: 42, paddingHorizontal: 0 }}>
            <FormIcon
              name={filled ? 'star-fill' : 'star-outline'}
              size={24}
              color={filled ? '#F59E0B' : styles.iconColor}
              renderOverride={renderIcon}
            />
          </Button>
        );
      })}
      <Text textStyle={styles.descriptionStyle}>{`${current} / ${maxRating}`}</Text>
    </Row>
  );
}

function ColorPickerField({
  field,
  fieldPath,
  value,
  onChange,
  onFocus,
  onBlur,
  disabled,
  readOnly,
  styles,
  registerFocusHandle,
}: FieldRendererProps) {
  const { store } = useActiveForm();
  const inputRef = useRef<TextInputRef>(null);
  const currentColor = typeof value === 'string' && value ? value : '#2563EB';
  const displayHex = typeof value === 'string' ? value : '#2563EB';
  const hexState = useNativeState<string>(displayHex);
  const externalVersion = store.getExternalVersion(fieldPath);
  const lastSyncedRef = useRef<number>(externalVersion);
  const presets = field.colorPresets ?? DEFAULT_COLOR_PRESETS;

  useEffect(() => {
    registerFocusHandle({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    });
    return () => registerFocusHandle(null);
  }, [registerFocusHandle]);

  useEffect(() => {
    if (lastSyncedRef.current !== externalVersion) {
      lastSyncedRef.current = externalVersion;
      if (hexState.get() !== displayHex) {
        hexState.set(displayHex);
      }
    }
  }, [externalVersion, displayHex, hexState]);

  const selectColor = (hex: string) => {
    hexState.set(hex);
    onChange(hex);
    onBlur();
  };

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      {!disabled && !readOnly
        ? renderNativePlatformColorPicker({
            color: currentColor,
            supportsOpacity: field.supportsOpacity ?? false,
            onSelectColor: selectColor,
          })
        : null}

      <Row spacing={8} alignment="center" style={{ width: '100%' }}>
        {presets.map((swatch) => {
          const isCurrent =
            typeof value === 'string' &&
            value.length > 0 &&
            value.toLowerCase() === swatch.toLowerCase();
          return (
            <Button
              key={swatch}
              variant="filled"
              disabled={disabled || readOnly}
              testID={`color-swatch-${fieldPath}-${swatch}`}
              onPress={() => selectColor(swatch)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                paddingHorizontal: 0,
                backgroundColor: swatch,
                borderWidth: isCurrent ? 2.5 : 1,
                borderColor: isCurrent ? styles.tintColor : '#CBD5E1',
              }}>
              <Text textStyle={{ color: '#FFFFFF', fontSize: 12 }}>
                {isCurrent ? '✓' : ''}
              </Text>
            </Button>
          );
        })}
      </Row>

      <TextInput
        ref={inputRef}
        value={hexState}
        placeholder="#RRGGBB"
        placeholderTextColor={styles.placeholderColor}
        editable={!disabled && !readOnly}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
        style={styles.inputStyle}
        textStyle={styles.inputTextStyle}
        testID={`color-hex-${fieldPath}`}
        onFocus={onFocus}
        onChangeText={(txt) => {
          if (hexState.get() !== txt) {
            hexState.set(txt);
          }
          onChange(txt);
        }}
        onBlur={onBlur}
      />
    </Column>
  );
}
