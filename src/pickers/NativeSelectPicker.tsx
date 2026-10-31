import { Column, Picker, Row, Text } from '@expo/ui';

import { useActiveForm } from '../core/context';
import type { FieldOption, FieldRendererProps } from '../types';
import { resolveLocalizedText } from '../utils/formatting';
import { useFieldOptions } from './optionsLoader';

const UNSELECTED_SENTINEL = '__expo_form_unselected__';

export interface NativeSelectPickerProps extends FieldRendererProps<string | number | undefined> {
  overrideOptions?: readonly FieldOption[];
}

/**
 * Native single-selection dropdown / wheel picker backed by `@expo/ui` universal `Picker`
 * (SwiftUI Picker on iOS, Jetpack Compose dropdown menu on Android, native `<select>` on web).
 */
export function NativeSelectPicker({
  field,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  styles,
  locale,
  overrideOptions,
  testID,
}: NativeSelectPickerProps & { testID?: string }) {
  const { dataSources, config } = useActiveForm();
  const loader = useFieldOptions({
    field,
    dataSources,
    getFieldValue: useActiveForm().store.getValue.bind(useActiveForm().store),
    locale,
  });

  const options = overrideOptions ?? loader.options;
  const placeholder =
    resolveLocalizedText(field.placeholder, locale, config.i18n?.translations) ?? 'Select an option';

  const appearance = (field.pickerAppearance ?? 'menu') as 'menu' | 'wheel';

  if (readOnly) {
    const selectedLabel =
      options.find((o) => String(o.value) === String(value))?.label ??
      (value !== undefined && value !== '' ? String(value) : '—');
    return (
      <Row style={styles.inputStyle} alignment="center">
        <Text textStyle={styles.inputTextStyle}>{selectedLabel}</Text>
      </Row>
    );
  }

  const selectedValue =
    value === undefined || value === null || value === ''
      ? UNSELECTED_SENTINEL
      : (value as string | number);

  return (
    <Column spacing={6} style={{ width: '100%' }}>
      <Row style={styles.inputStyle} alignment="center">
        <Picker
          selectedValue={selectedValue}
          appearance={appearance}
          enabled={!disabled && !loader.loading}
          testID={testID ?? field.testID ?? `picker-${field.name}`}
          onValueChange={(nextVal) => {
            if (nextVal === UNSELECTED_SENTINEL) {
              onChange('');
            } else {
              // Preserve original option value type (number vs string)
              const matched = options.find((o) => String(o.value) === String(nextVal));
              onChange((matched ? matched.value : nextVal) as string | number);
            }
            onBlur();
          }}>
          <Picker.Item label={loader.loading ? 'Loading...' : placeholder} value={UNSELECTED_SENTINEL} />
          {options.map((opt) => (
            <Picker.Item
              key={String(opt.value)}
              label={opt.flag ? `${opt.flag} ${opt.label}` : opt.label}
              value={opt.value as string | number}
            />
          ))}
        </Picker>
      </Row>
    </Column>
  );
}
