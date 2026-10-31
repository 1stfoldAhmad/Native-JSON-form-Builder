import { useMemo, useState } from 'react';
import {
  Button,
  Collapsible,
  Column,
  FieldGroup,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from '@expo/ui';

import {
  buildNativeAnimationModifiers,
  resolveAnimationTrigger,
} from '../animations/AnimationAdapter';
import { useActiveForm } from '../core/context';
import { getPlatformHeadingModifiers } from '../core/nativePlatformBridge';
import { FormIcon, NativeIconButton } from '../icons/IconRenderer';
import { useRenderFieldList } from '../renderer/renderDelegate';
import { StepWizardRenderer } from '../renderer/StepWizardRenderer';
import { resolveFormStyles } from '../styles/StyleResolver';
import type { FieldRendererProps } from '../types';
import { deepClone } from '../utils/deepPath';
import { formatNumberValue, resolveLocalizedText } from '../utils/formatting';

/**
 * Unified native renderer for all 14 Category G Structural & Advanced fields:
 * `heading`, `description`, `staticText`, `divider`, `section`, `fieldGroup`,
 * `hidden`, `readOnly`, `computed`, `repeater`, `objectGroup`, `arrayGroup`,
 * `conditionalGroup`, and `stepGroup`.
 */
export function StructuralFieldRenderer(props: FieldRendererProps) {
  switch (props.field.type) {
    case 'hidden':
      return null;
    case 'heading':
      return <HeadingField {...props} />;
    case 'description':
    case 'staticText':
      return <StaticTextField {...props} />;
    case 'divider':
      return <DividerField />;
    case 'readOnly':
    case 'computed':
    case 'calculated':
      return <ReadOnlyOrComputedField {...props} />;
    case 'section':
      return <InlineSectionField {...props} />;
    case 'fieldGroup':
      return <NativeFieldGroupField {...props} />;
    case 'conditionalGroup':
      return <ConditionalGroupField {...props} />;
    case 'objectGroup':
      return <ObjectGroupField {...props} />;
    case 'repeater':
      return <RepeaterField {...props} />;
    case 'arrayGroup':
      return <ArrayGroupField {...props} />;
    case 'stepGroup':
      return props.field.steps?.length ? (
        <StepWizardRenderer steps={props.field.steps} inline />
      ) : null;
    default:
      return null;
  }
}

function HeadingField({ field, locale, styles }: FieldRendererProps) {
  const { config } = useActiveForm();
  const text =
    resolveLocalizedText(field.content ?? field.label, locale, config.i18n?.translations) ?? '';
  const level = field.level ?? 2;
  const sizeByLevel: Record<number, number> = { 1: 24, 2: 19, 3: 16, 4: 14 };
  const fontSize = sizeByLevel[level] ?? 18;

  const headingModifiers = getPlatformHeadingModifiers(text);

  return (
    <Text
      modifiers={headingModifiers}
      testID={field.testID ?? `heading-${field.id ?? field.name ?? text}`}
      textStyle={{
        ...styles.labelStyle,
        fontSize,
        fontWeight: '700',
      }}>
      {text}
    </Text>
  );
}

function StaticTextField({ field, locale, styles }: FieldRendererProps) {
  const { config } = useActiveForm();
  const text =
    resolveLocalizedText(
      field.content ?? field.description ?? field.label,
      locale,
      config.i18n?.translations
    ) ?? '';

  return (
    <Text
      testID={field.testID}
      textStyle={{
        ...styles.descriptionStyle,
        fontSize: field.type === 'staticText' ? 14 : 13,
      }}>
      {text}
    </Text>
  );
}

function DividerField() {
  const { config, colorScheme, isRTL } = useActiveForm();
  const formStyles = resolveFormStyles(config.style, config.theme, colorScheme, isRTL);

  return (
    <Column
      style={{
        width: '100%',
        paddingVertical: formStyles.divider.marginVertical,
      }}>
      <Row
        style={{
          width: '100%',
          height: formStyles.divider.height,
          backgroundColor: formStyles.divider.color,
        }}
      />
    </Column>
  );
}

function ReadOnlyOrComputedField({
  field,
  fieldPath,
  value,
  styles,
  locale,
}: FieldRendererProps) {
  let display = '—';
  if (typeof value === 'number' && !Number.isNaN(value)) {
    display = formatNumberValue(
      value,
      {
        ...field.format,
        precision: field.precision ?? field.format?.precision,
        prefix: field.prefix ?? field.format?.prefix,
        suffix: field.suffix ?? field.format?.suffix,
        currencyCode: field.currency ?? field.format?.currencyCode,
      },
      locale
    );
  } else if (value !== null && value !== undefined && String(value) !== '') {
    display = `${field.prefix ?? ''}${String(value)}${field.suffix ?? ''}`;
  }

  return (
    <Row
      alignment="center"
      testID={field.testID ?? `computed-${fieldPath}`}
      style={{
        ...styles.inputStyle,
        opacity: 0.9,
      }}>
      <Text textStyle={{ ...styles.inputTextStyle, fontWeight: '600' }}>{display}</Text>
    </Row>
  );
}

function InlineSectionField({ field, locale }: FieldRendererProps) {
  const { config, colorScheme, isRTL } = useActiveForm();
  const renderFieldList = useRenderFieldList();
  const [expanded, setExpanded] = useState(field.defaultExpanded ?? true);

  const formStyles = resolveFormStyles(config.style, config.theme, colorScheme, isRTL);
  const title = resolveLocalizedText(field.label, locale, config.i18n?.translations);
  const desc = resolveLocalizedText(field.description, locale, config.i18n?.translations);

  const innerContent = (
    <Column spacing={formStyles.sectionGap} style={{ width: '100%' }}>
      {desc ? <Text textStyle={formStyles.sectionDescriptionStyle}>{desc}</Text> : null}
      {field.fields ? renderFieldList(field.fields) : null}
    </Column>
  );

  if (field.collapsible) {
    return (
      <Column spacing={8} style={formStyles.sectionBox} testID={field.testID}>
        <Collapsible
          isOpen={expanded}
          onOpenChange={setExpanded}
          label={title ?? 'Section'}
          labelStyle={formStyles.sectionHeaderStyle}>
          {innerContent}
        </Collapsible>
      </Column>
    );
  }

  return (
    <Column spacing={formStyles.sectionGap} style={formStyles.sectionBox} testID={field.testID}>
      {title ? <Text textStyle={formStyles.sectionHeaderStyle}>{title}</Text> : null}
      {innerContent}
    </Column>
  );
}

function NativeFieldGroupField({ field, locale }: FieldRendererProps) {
  const { config } = useActiveForm();
  const renderFieldList = useRenderFieldList();
  const title = resolveLocalizedText(field.label, locale, config.i18n?.translations);
  const footer = resolveLocalizedText(field.helperText, locale, config.i18n?.translations);

  return (
    <FieldGroup style={{ width: '100%' }} testID={field.testID}>
      <FieldGroup.Section title={title}>
        {field.fields ? renderFieldList(field.fields, { insideFieldGroup: true }) : null}
        {footer ? (
          <FieldGroup.SectionFooter>
            <Text textStyle={{ fontSize: 12, color: '#64748B' }}>{footer}</Text>
          </FieldGroup.SectionFooter>
        ) : null}
      </FieldGroup.Section>
    </FieldGroup>
  );
}

function ConditionalGroupField({ field }: FieldRendererProps) {
  const { config, reducedMotion } = useActiveForm();
  const renderFieldList = useRenderFieldList();
  const revealAnim = resolveAnimationTrigger(config.animations, 'fieldReveal', {
    fieldAnimations: field.animations,
    reducedMotion,
  });
  const modifiers = buildNativeAnimationModifiers(revealAnim, true);

  if (!field.fields?.length) return null;
  return (
    <Column
      spacing={14}
      style={{ width: '100%' }}
      modifiers={modifiers.length > 0 ? modifiers : undefined}
      testID={field.testID}>
      {renderFieldList(field.fields)}
    </Column>
  );
}

function ObjectGroupField({ field, fieldPath, locale }: FieldRendererProps) {
  const { config, colorScheme, isRTL } = useActiveForm();
  const renderFieldList = useRenderFieldList();
  const formStyles = useMemo(
    () => resolveFormStyles(config.style, config.theme, colorScheme, isRTL),
    [config.style, config.theme, colorScheme, isRTL]
  );
  const title = resolveLocalizedText(field.label, locale, config.i18n?.translations);

  return (
    <Column spacing={formStyles.sectionGap} style={formStyles.sectionBox} testID={field.testID}>
      {title ? <Text textStyle={formStyles.sectionHeaderStyle}>{title}</Text> : null}
      {field.fields ? renderFieldList(field.fields, { pathPrefix: fieldPath }) : null}
    </Column>
  );
}

function RepeaterField({
  field,
  fieldPath,
  value,
  onChange,
  disabled,
  readOnly,
  styles,
  locale,
}: FieldRendererProps) {
  const { config, colorScheme, isRTL, renderIcon } = useActiveForm();
  const renderFieldList = useRenderFieldList();
  const formStyles = useMemo(
    () => resolveFormStyles(config.style, config.theme, colorScheme, isRTL),
    [config.style, config.theme, colorScheme, isRTL]
  );

  const items: Record<string, unknown>[] = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : [];

  const minItems = field.minItems ?? field.validation?.minItems ?? 0;
  const maxItems = field.maxItems ?? field.validation?.maxItems;
  const canAdd = maxItems === undefined || items.length < maxItems;
  const canRemove = items.length > minItems;

  const createBlankRow = (): Record<string, unknown> => {
    const blank: Record<string, unknown> = {};
    for (const child of field.fields ?? []) {
      if (child.name) {
        blank[child.name] =
          child.defaultValue !== undefined ? deepClone(child.defaultValue) : '';
      }
    }
    return blank;
  };

  const addRow = () => {
    if (!canAdd || disabled || readOnly) return;
    onChange([...items, createBlankRow()]);
  };

  const removeRow = (index: number) => {
    if (!canRemove || disabled || readOnly) return;
    onChange(items.filter((_, idx) => idx !== index));
  };

  const title = resolveLocalizedText(field.label, locale, config.i18n?.translations);

  return (
    <Column spacing={12} style={{ width: '100%' }} testID={`repeater-${fieldPath}`}>
      {title ? <Text textStyle={styles.labelStyle}>{title}</Text> : null}

      {items.map((_, index) => {
        const itemTitle = (field.itemLabelTemplate ?? 'Item #{{index}}').replace(
          /\{\{\s*index\s*\}\}/g,
          String(index + 1)
        );
        return (
          <Column
            key={`${fieldPath}-${index}`}
            spacing={12}
            style={formStyles.sectionBox}
            testID={`repeater-item-${fieldPath}-${index}`}>
            <Row alignment="center" style={{ width: '100%' }}>
              <Text textStyle={{ ...styles.labelStyle, fontWeight: '600' }}>{itemTitle}</Text>
              <Spacer flexible />
              {!disabled && !readOnly && canRemove ? (
                <NativeIconButton
                  name="trash"
                  size={18}
                  color="#DC2626"
                  accessibilityLabel={field.removeButtonLabel ?? `Remove ${itemTitle}`}
                  testID={`repeater-remove-${fieldPath}-${index}`}
                  onPress={() => removeRow(index)}
                  renderOverride={renderIcon}
                />
              ) : null}
            </Row>

            {field.fields
              ? renderFieldList(field.fields, { pathPrefix: `${fieldPath}.${index}` })
              : null}
          </Column>
        );
      })}

      {!readOnly && canAdd ? (
        <Button
          variant="outlined"
          disabled={disabled}
          testID={`repeater-add-${fieldPath}`}
          onPress={addRow}
          style={{ height: 44, borderRadius: 10 }}>
          <Row spacing={6} alignment="center">
            <FormIcon name="plus" size={16} color={styles.tintColor} renderOverride={renderIcon} />
            <Text textStyle={{ ...styles.inputTextStyle, fontWeight: '600' }}>
              {field.addButtonLabel ?? 'Add Item'}
            </Text>
          </Row>
        </Button>
      ) : null}
    </Column>
  );
}

function ArrayGroupField({
  field,
  fieldPath,
  value,
  onChange,
  disabled,
  readOnly,
  styles,
}: FieldRendererProps) {
  const { renderIcon } = useActiveForm();
  // If child sub-fields are provided, delegate to RepeaterField
  if (field.fields?.length) {
    return (
      <RepeaterField
        {...({
          field,
          fieldPath,
          value,
          onChange,
          disabled,
          readOnly,
          styles,
        } as FieldRendererProps)}
      />
    );
  }

  const list: string[] = Array.isArray(value) ? value.map(String) : [];
  const draftState = useNativeState<string>('');
  const [draft, setDraft] = useState('');

  const addItem = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...list, trimmed]);
    draftState.set('');
    setDraft('');
  };

  return (
    <Column spacing={8} style={{ width: '100%' }}>
      {list.map((entry, idx) => (
        <Row
          key={`${fieldPath}-${idx}`}
          alignment="center"
          spacing={8}
          style={styles.inputStyle}>
          <Text textStyle={styles.inputTextStyle}>{entry}</Text>
          <Spacer flexible />
          {!disabled && !readOnly ? (
            <NativeIconButton
              name="trash"
              size={16}
              color="#DC2626"
              onPress={() => onChange(list.filter((_, i) => i !== idx))}
              renderOverride={renderIcon}
            />
          ) : null}
        </Row>
      ))}

      {!readOnly ? (
        <Row spacing={8} alignment="center" style={{ width: '100%' }}>
          <TextInput
            value={draftState}
            placeholder={typeof field.placeholder === 'string' ? field.placeholder : 'Enter item...'}
            placeholderTextColor={styles.placeholderColor}
            editable={!disabled}
            style={{ ...styles.inputStyle, width: '76%' }}
            textStyle={styles.inputTextStyle}
            onChangeText={setDraft}
            onSubmitEditing={addItem}
          />
          <Button
            variant="filled"
            label={field.addButtonLabel ?? 'Add'}
            disabled={disabled || !draft.trim()}
            onPress={addItem}
            style={{ height: styles.inputStyle.height ?? 48, borderRadius: 10 }}
          />
        </Row>
      ) : null}
    </Column>
  );
}
