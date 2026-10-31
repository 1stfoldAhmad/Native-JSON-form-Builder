import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  Button,
  Column,
  Picker,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';

import { useActiveForm } from '../core/context';
import { ManagedRNHostView } from '../core/HostBoundary';
import { FormIcon } from '../icons/IconRenderer';
import { NativeSelectPicker } from '../pickers/NativeSelectPicker';
import { SearchablePicker } from '../pickers/SearchablePicker';
import type { FieldOption, FieldRendererProps } from '../types';
import { COMMON_TIMEZONES, MONTHS_OPTIONS } from '../utils/countries';
import { formatDateISO, resolveLocalizedText } from '../utils/formatting';

function parseDateValue(raw: unknown, mode: 'date' | 'time' | 'datetime'): Date {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    if (mode === 'time' && /^\d{1,2}:\d{2}/.test(raw.trim())) {
      const [hh, mm] = raw.trim().split(':').map(Number);
      const d = new Date();
      d.setHours(hh || 0, mm || 0, 0, 0);
      return d;
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Unified native renderer for all 9 Category D Date & Time fields:
 * `date`, `time`, `dateTime`, `dateRange`, `birthday`, `month`, `year`,
 * `duration`, and `timezone`.
 *
 * Uses `@expo/ui/community/datetime-picker` safely hosted inside `ManagedRNHostView`
 * on iOS (SwiftUI DatePicker) and Android (Jetpack Compose Material3 DatePicker/TimePicker),
 * with an `@expo/ui` universal TextInput control on Web.
 */
export function DateTimeFieldRenderer(props: FieldRendererProps) {
  switch (props.field.type) {
    case 'date':
    case 'birthday':
      return <SingleDateTimeField {...props} mode="date" />;
    case 'time':
      return <SingleDateTimeField {...props} mode="time" />;
    case 'dateTime':
      return <SingleDateTimeField {...props} mode="datetime" />;
    case 'dateRange':
      return <DateRangeField {...props} />;
    case 'month':
      return (
        <NativeSelectPicker
          {...(props as FieldRendererProps<string | number | undefined>)}
          overrideOptions={props.field.options ? undefined : MONTHS_OPTIONS}
        />
      );
    case 'year':
      return <YearPickerField {...props} />;
    case 'duration':
      return <DurationField {...props} />;
    case 'timezone':
      return (
        <SearchablePicker
          {...props}
          multiple={false}
          overrideOptions={props.field.options || props.field.dataSource ? undefined : COMMON_TIMEZONES}
        />
      );
    default:
      return <SingleDateTimeField {...props} mode="date" />;
  }
}

function SingleDateTimeField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
  locale,
  mode,
}: FieldRendererProps & { mode: 'date' | 'time' | 'datetime' }) {
  const { config, colorScheme, renderIcon } = useActiveForm();
  const [androidDialogOpen, setAndroidDialogOpen] = useState(false);

  const strValue = typeof value === 'string' ? value : '';
  const webState = useNativeState<string>(strValue);

  const minDate = useMemo(() => {
    if (field.minDate) return new Date(field.minDate);
    if (field.type === 'birthday') return new Date('1900-01-01');
    return undefined;
  }, [field.minDate, field.type]);

  const maxDate = useMemo(() => {
    if (field.maxDate) return new Date(field.maxDate);
    if (field.type === 'birthday') return new Date();
    return undefined;
  }, [field.maxDate, field.type]);

  const currentDate = useMemo(() => parseDateValue(value, mode), [value, mode]);

  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ??
    (mode === 'time' ? 'HH:MM' : mode === 'datetime' ? 'YYYY-MM-DDTHH:MM' : 'YYYY-MM-DD');

  if (readOnly) {
    return (
      <Row style={styles.inputStyle} alignment="center">
        <Text textStyle={styles.inputTextStyle}>{strValue || '—'}</Text>
      </Row>
    );
  }

  // Web fallback because `@expo/ui/community/datetime-picker`'s `DateTimePicker.web.js` returns `null`
  if (Platform.OS === 'web') {
    return (
      <Row alignment="center" spacing={8} style={styles.inputStyle}>
        <FormIcon
          name={mode === 'time' ? 'clock' : 'calendar'}
          size={styles.iconSize}
          color={styles.iconColor}
          renderOverride={renderIcon}
        />
        <TextInput
          value={webState}
          placeholder={placeholder}
          placeholderTextColor={styles.placeholderColor}
          editable={!disabled}
          testID={field.testID ?? `datetime-input-${fieldPath}`}
          style={{
            width: '88%',
            height: styles.inputStyle.height,
            backgroundColor: 'transparent',
            borderWidth: 0,
            paddingHorizontal: 4,
          }}
          textStyle={styles.inputTextStyle}
          onChangeText={(txt) => onChange(txt)}
          onBlur={onBlur}
        />
      </Row>
    );
  }

  if (Platform.OS === 'android' && (field.datePresentation ?? 'dialog') === 'dialog') {
    return (
      <Column spacing={6} style={{ width: '100%' }}>
        <Button
          variant="outlined"
          disabled={disabled}
          testID={field.testID ?? `datetime-trigger-${fieldPath}`}
          onPress={() => setAndroidDialogOpen(true)}
          style={styles.inputStyle}>
          <Row alignment="center" spacing={8} style={{ width: '100%' }}>
            <FormIcon
              name={mode === 'time' ? 'clock' : 'calendar'}
              size={styles.iconSize}
              color={styles.iconColor}
              renderOverride={renderIcon}
            />
            <Text
              textStyle={{
                ...styles.inputTextStyle,
                color: strValue
                  ? (styles.inputTextStyle.color ?? '#0F172A')
                  : styles.placeholderColor,
              }}>
              {strValue || placeholder}
            </Text>
            <Spacer flexible />
          </Row>
        </Button>

        {androidDialogOpen ? (
          <ManagedRNHostView matchContents>
            <DateTimePicker
              value={currentDate}
              mode={mode}
              minimumDate={minDate}
              maximumDate={maxDate}
              is24Hour={field.is24Hour}
              accentColor={styles.tintColor}
              themeVariant={colorScheme}
              presentation="dialog"
              onValueChange={(_event, selectedDate) => {
                setAndroidDialogOpen(false);
                onChange(formatDateISO(selectedDate, mode));
                onBlur();
              }}
              onDismiss={() => {
                setAndroidDialogOpen(false);
                onBlur();
              }}
            />
          </ManagedRNHostView>
        ) : null}
      </Column>
    );
  }

  // iOS (compact/inline/spinner) or Android inline presentation
  return (
    <ManagedRNHostView matchContents={{ vertical: true }}>
      <DateTimePicker
        value={currentDate}
        mode={mode}
        display={(field.dateDisplay ?? 'compact') as 'default' | 'spinner' | 'compact' | 'inline'}
        presentation="inline"
        minimumDate={minDate}
        maximumDate={maxDate}
        disabled={disabled}
        locale={field.locale ?? locale}
        timeZoneName={field.timezone ?? config.i18n?.timezone}
        accentColor={styles.tintColor}
        themeVariant={colorScheme}
        testID={field.testID ?? `datetime-picker-${fieldPath}`}
        onValueChange={(_event, selectedDate) => {
          onChange(formatDateISO(selectedDate, mode));
          onBlur();
        }}
      />
    </ManagedRNHostView>
  );
}

function DateRangeField(props: FieldRendererProps) {
  const { fieldPath, value, onChange, onBlur, styles } = props;
  const rangeVal =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { startDate?: string; endDate?: string })
      : { startDate: '', endDate: '' };

  return (
    <Column spacing={10} style={{ width: '100%' }}>
      <Column spacing={4} style={{ width: '100%' }}>
        <Text textStyle={styles.descriptionStyle}>Start Date</Text>
        <SingleDateTimeField
          {...props}
          field={{ ...props.field, testID: `date-range-start-${fieldPath}` }}
          fieldPath={`${fieldPath}.startDate`}
          value={rangeVal.startDate ?? ''}
          mode="date"
          onChange={(nextStart) => {
            onChange({ ...rangeVal, startDate: String(nextStart ?? '') });
            onBlur();
          }}
        />
      </Column>
      <Column spacing={4} style={{ width: '100%' }}>
        <Text textStyle={styles.descriptionStyle}>End Date</Text>
        <SingleDateTimeField
          {...props}
          field={{
            ...props.field,
            minDate: rangeVal.startDate || props.field.minDate,
            testID: `date-range-end-${fieldPath}`,
          }}
          fieldPath={`${fieldPath}.endDate`}
          value={rangeVal.endDate ?? ''}
          mode="date"
          onChange={(nextEnd) => {
            onChange({ ...rangeVal, endDate: String(nextEnd ?? '') });
            onBlur();
          }}
        />
      </Column>
    </Column>
  );
}

function YearPickerField(props: FieldRendererProps) {
  const currentYear = new Date().getFullYear();
  const minYear = props.field.min ?? currentYear - 100;
  const maxYear = props.field.max ?? currentYear + 10;

  const yearOptions = useMemo<FieldOption[]>(() => {
    const list: FieldOption[] = [];
    for (let y = maxYear; y >= minYear; y--) {
      list.push({ label: String(y), value: String(y) });
    }
    return list;
  }, [minYear, maxYear]);

  return (
    <NativeSelectPicker
      {...(props as FieldRendererProps<string | number | undefined>)}
      overrideOptions={yearOptions}
    />
  );
}

function DurationField({
  field,
  fieldPath,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
}: FieldRendererProps) {
  // Stores total minutes or `HH:MM` string; defaults to `HH:MM`
  const str = typeof value === 'string' && value.includes(':') ? value : '00:30';
  const [rawHours, rawMinutes] = str.split(':').map((n) => Number.parseInt(n, 10) || 0);

  const updateDuration = (hh: number, mm: number) => {
    const formatted = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    onChange(formatted);
    onBlur();
  };

  return (
    <Row spacing={12} alignment="center" style={styles.inputStyle}>
      <Row spacing={4} alignment="center">
        <Picker
          selectedValue={rawHours}
          appearance="menu"
          enabled={!disabled && !readOnly}
          testID={`duration-hours-${fieldPath}`}
          onValueChange={(nextH) => updateDuration(Number(nextH), rawMinutes)}>
          {Array.from({ length: 24 }, (_, h) => (
            <Picker.Item key={h} label={`${h} hr`} value={h} />
          ))}
        </Picker>
      </Row>
      <Row spacing={4} alignment="center">
        <Picker
          selectedValue={rawMinutes}
          appearance="menu"
          enabled={!disabled && !readOnly}
          testID={`duration-minutes-${fieldPath}`}
          onValueChange={(nextM) => updateDuration(rawHours, Number(nextM))}>
          {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
            <Picker.Item key={m} label={`${m} min`} value={m} />
          ))}
        </Picker>
      </Row>
    </Row>
  );
}
