import { useMemo, useState } from 'react';
import {
  BottomSheet,
  Button,
  Checkbox,
  Column,
  Row,
  ScrollView,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';

import { useActiveForm } from '../core/context';
import { FormIcon, NativeIconButton } from '../icons/IconRenderer';
import type { FieldOption, FieldRendererProps } from '../types';
import { deepEqual } from '../utils/deepPath';
import { resolveLocalizedText } from '../utils/formatting';
import { useFieldOptions } from './optionsLoader';

export interface SearchablePickerProps extends FieldRendererProps {
  multiple?: boolean;
  overrideOptions?: readonly FieldOption[];
}

function HighlightedLabel({
  text,
  query,
  highlightEnabled,
  baseColor,
  accentColor,
}: {
  text: string;
  query: string;
  highlightEnabled: boolean;
  baseColor: string;
  accentColor: string;
}) {
  if (!highlightEnabled || !query.trim()) {
    return <Text textStyle={{ fontSize: 15, color: baseColor }}>{text}</Text>;
  }

  const lower = text.toLowerCase();
  const q = query.trim().toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) {
    return <Text textStyle={{ fontSize: 15, color: baseColor }}>{text}</Text>;
  }

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);

  return (
    <Row alignment="center" spacing={0}>
      {before ? <Text textStyle={{ fontSize: 15, color: baseColor }}>{before}</Text> : null}
      <Text textStyle={{ fontSize: 15, fontWeight: '700', color: accentColor }}>{match}</Text>
      {after ? <Text textStyle={{ fontSize: 15, color: baseColor }}>{after}</Text> : null}
    </Row>
  );
}

/**
 * Reusable native searchable single-select & multi-select picker (Section 11).
 * Built exclusively with `@expo/ui` components (`BottomSheet`, `TextInput` + `useNativeState`,
 * `ScrollView`, `Checkbox`, `Button`, `Row`, `Column`, `Text`, `Spacer`).
 */
export function SearchablePicker({
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
  multiple = false,
  overrideOptions,
}: SearchablePickerProps) {
  const { dataSources, config, renderIcon } = useActiveForm();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchNativeState = useNativeState<string>('');

  const loader = useFieldOptions({
    field,
    dataSources,
    getFieldValue,
    locale,
    searchQuery: query,
  });

  const options = useMemo(() => {
    if (!overrideOptions) return loader.options;
    if (!query.trim()) return [...overrideOptions];
    const q = query.trim().toLowerCase();
    return overrideOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || String(o.value).toLowerCase().includes(q)
    );
  }, [overrideOptions, loader.options, query]);

  const selectedArray: unknown[] = useMemo(() => {
    if (multiple) {
      return Array.isArray(value) ? value : [];
    }
    return value !== undefined && value !== null && value !== '' ? [value] : [];
  }, [multiple, value]);

  const isSelected = (candidate: unknown) =>
    selectedArray.some((item) => deepEqual(item, candidate));

  const maxSelections = field.maxSelections ?? field.validation?.maxItems;
  const canSelectMore = maxSelections === undefined || selectedArray.length < maxSelections;

  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ??
    (multiple ? 'Select options...' : 'Select an option...');

  const searchPlaceholder = field.searchPlaceholder ?? 'Search...';
  const clearable = field.clearable ?? true;
  const allowSelectAll = multiple && (field.selectAll ?? true);
  const highlightMatches = field.highlightMatches ?? true;

  const summaryText = useMemo(() => {
    if (selectedArray.length === 0) return '';
    const lookupPool = overrideOptions ?? loader.allKnownOptions;
    const labels = selectedArray.map((val) => {
      const found = lookupPool.find((o) => deepEqual(o.value, val));
      if (!found) return String(val);
      return found.flag ? `${found.flag} ${found.label}` : found.label;
    });
    return labels.join(', ');
  }, [selectedArray, overrideOptions, loader.allKnownOptions]);

  const groupedOptions = useMemo(() => {
    const hasGroups = field.groupBy || options.some((o) => Boolean(o.group));
    if (!hasGroups) {
      return [{ group: '', items: options }];
    }
    const map = new Map<string, FieldOption[]>();
    for (const opt of options) {
      const g = opt.group ?? 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(opt);
    }
    return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
  }, [options, field.groupBy]);

  const handleOpen = () => {
    if (disabled || readOnly) return;
    onFocus();
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setQuery('');
    searchNativeState.set('');
    onBlur();
  };

  const toggleOption = (opt: FieldOption) => {
    if (opt.disabled) return;
    if (!multiple) {
      onChange(opt.value);
      handleClose();
      return;
    }

    if (isSelected(opt.value)) {
      onChange(selectedArray.filter((item) => !deepEqual(item, opt.value)));
    } else if (canSelectMore) {
      onChange([...selectedArray, opt.value]);
    }
  };

  const handleSelectAll = () => {
    const enabledValues = options.filter((o) => !o.disabled).map((o) => o.value);
    const capped =
      maxSelections !== undefined ? enabledValues.slice(0, maxSelections) : enabledValues;
    onChange(capped);
  };

  const handleClear = () => {
    onChange(multiple ? [] : '');
  };

  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Row alignment="center" spacing={8} style={styles.inputStyle}>
        <Button
          variant="text"
          onPress={handleOpen}
          disabled={disabled || readOnly}
          testID={field.testID ?? `searchable-trigger-${fieldPath}`}
          style={{ width: clearable && selectedArray.length > 0 ? '84%' : '100%', paddingHorizontal: 0 }}>
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            <Text
              numberOfLines={1}
              textStyle={{
                ...styles.inputTextStyle,
                color: summaryText
                  ? (styles.inputTextStyle.color ?? '#0F172A')
                  : styles.placeholderColor,
              }}>
              {summaryText || placeholder}
            </Text>
            <Spacer flexible />
            <FormIcon
              name="chevron-down"
              size={16}
              color={styles.iconColor}
              renderOverride={renderIcon}
            />
          </Row>
        </Button>

        {clearable && selectedArray.length > 0 && !disabled && !readOnly ? (
          <NativeIconButton
            name="clear"
            size={16}
            color={styles.iconColor}
            accessibilityLabel="Clear selection"
            testID={`searchable-clear-${fieldPath}`}
            onPress={handleClear}
            renderOverride={renderIcon}
          />
        ) : null}
      </Row>

      <BottomSheet
        isPresented={isOpen}
        onDismiss={handleClose}
        snapPoints={['half', 'full']}
        testID={`searchable-sheet-${fieldPath}`}>
        <Column spacing={12} style={{ width: '100%', paddingBottom: 24 }}>
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            <Text
              textStyle={{
                fontSize: 17,
                fontWeight: '600',
                color: styles.labelStyle.color ?? '#0F172A',
              }}>
              {resolveLocalizedText(field.label, locale, config.i18n?.translations) ?? placeholder}
            </Text>
            <Spacer flexible />
            <Button
              variant="text"
              label="Done"
              onPress={handleClose}
              testID={`searchable-done-${fieldPath}`}
            />
          </Row>

          {field.searchable !== false ? (
            <TextInput
              value={searchNativeState}
              placeholder={searchPlaceholder}
              placeholderTextColor={styles.placeholderColor}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              testID={`searchable-input-${fieldPath}`}
              style={styles.inputStyle}
              textStyle={styles.inputTextStyle}
              onChangeText={(txt) => {
                setQuery(txt);
              }}
            />
          ) : null}

          {allowSelectAll && options.length > 0 ? (
            <Row alignment="center" spacing={8}>
              <Button
                variant="outlined"
                label="Select All"
                onPress={handleSelectAll}
                testID={`searchable-select-all-${fieldPath}`}
              />
              <Button
                variant="text"
                label="Deselect All"
                onPress={handleClear}
                testID={`searchable-deselect-all-${fieldPath}`}
              />
              {maxSelections !== undefined ? (
                <Text textStyle={styles.descriptionStyle}>
                  {`${selectedArray.length} / ${maxSelections} selected`}
                </Text>
              ) : null}
            </Row>
          ) : null}

          {loader.loading ? (
            <Text textStyle={styles.descriptionStyle}>
              {typeof field.dataSource === 'object' && field.dataSource.loadingMessage
                ? field.dataSource.loadingMessage
                : 'Loading options...'}
            </Text>
          ) : null}

          {!loader.loading && options.length === 0 ? (
            <Text textStyle={styles.descriptionStyle}>
              {typeof field.dataSource === 'object' && field.dataSource.emptyMessage
                ? field.dataSource.emptyMessage
                : 'No matching options found.'}
            </Text>
          ) : null}

          <ScrollView direction="vertical" style={{ height: 280, width: '100%' }}>
            <Column spacing={8} style={{ width: '100%' }}>
              {groupedOptions.map((section) => (
                <Column key={section.group || '__default__'} spacing={6} style={{ width: '100%' }}>
                  {section.group ? (
                    <Text
                      textStyle={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: styles.descriptionStyle.color ?? '#64748B',
                      }}>
                      {section.group.toUpperCase()}
                    </Text>
                  ) : null}

                  {section.items.map((opt) => {
                    const checked = isSelected(opt.value);
                    const optionDisabled =
                      Boolean(opt.disabled) || (multiple && !checked && !canSelectMore);

                    if (multiple) {
                      return (
                        <Row
                          key={String(opt.value)}
                          alignment="center"
                          spacing={10}
                          style={{
                            width: '100%',
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                          }}>
                          <Checkbox
                            value={checked}
                            disabled={optionDisabled}
                            label={opt.flag ? `${opt.flag} ${opt.label}` : opt.label}
                            testID={`searchable-option-${fieldPath}-${String(opt.value)}`}
                            onValueChange={() => toggleOption(opt)}
                          />
                          {opt.description ? (
                            <>
                              <Spacer flexible />
                              <Text textStyle={styles.descriptionStyle}>{opt.description}</Text>
                            </>
                          ) : null}
                        </Row>
                      );
                    }

                    return (
                      <Button
                        key={String(opt.value)}
                        variant={checked ? 'filled' : 'text'}
                        disabled={optionDisabled}
                        testID={`searchable-option-${fieldPath}-${String(opt.value)}`}
                        onPress={() => toggleOption(opt)}
                        style={{
                          width: '100%',
                          height: 44,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                        }}>
                        <Row alignment="center" spacing={8} style={{ width: '100%' }}>
                          {opt.flag ? (
                            <Text textStyle={{ fontSize: 18 }}>{opt.flag}</Text>
                          ) : null}
                          <HighlightedLabel
                            text={opt.label}
                            query={query}
                            highlightEnabled={highlightMatches}
                            baseColor={
                              checked
                                ? '#FFFFFF'
                                : (styles.inputTextStyle.color ?? '#0F172A')
                            }
                            accentColor={checked ? '#FFFFFF' : styles.tintColor}
                          />
                          <Spacer flexible />
                          {opt.description ? (
                            <Text
                              textStyle={{
                                fontSize: 13,
                                color: checked
                                  ? '#E2E8F0'
                                  : (styles.descriptionStyle.color ?? '#64748B'),
                              }}>
                              {opt.description}
                            </Text>
                          ) : null}
                          {checked ? (
                            <FormIcon
                              name="check"
                              size={16}
                              color="#FFFFFF"
                              renderOverride={renderIcon}
                            />
                          ) : null}
                        </Row>
                      </Button>
                    );
                  })}
                </Column>
              ))}

              {loader.hasMore ? (
                <Button
                  variant="outlined"
                  label={loader.loading ? 'Loading...' : 'Load More'}
                  onPress={loader.loadMore}
                  disabled={loader.loading}
                />
              ) : null}
            </Column>
          </ScrollView>
        </Column>
      </BottomSheet>
    </Column>
  );
}
