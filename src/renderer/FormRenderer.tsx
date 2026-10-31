import { useCallback, useMemo, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { Button, Column, List, Row, Text } from '@expo/ui';

import {
  buildNativeAnimationModifiers,
  resolveAnimationTrigger,
} from '../animations/AnimationAdapter';
import { useActiveForm } from '../core/context';
import {
  KeyboardLayoutAdapter,
  shouldUseLazyListRendering,
  type KeyboardScrollHandle,
} from '../keyboard/KeyboardLayoutAdapter';
import { useFormSelector } from '../state/useFormSelector';
import { resolveFormStyles } from '../styles/StyleResolver';
import type { ConfigSchemaIssue, FieldConfig } from '../types';
import { resolveLocalizedText } from '../utils/formatting';
import { FieldNodeRenderer } from './FieldNodeRenderer';
import { FieldRenderDelegateContext, type FieldListRenderOptions } from './renderDelegate';
import { SectionRenderer } from './SectionRenderer';
import { StepWizardRenderer } from './StepWizardRenderer';

export interface FormRendererProps {
  externalDisabled?: boolean;
  externalReadOnly?: boolean;
  externalLoading?: boolean;
  externalFormErrors?: readonly string[];
  configIssues?: readonly ConfigSchemaIssue[];
  testID?: string;
  onBindScrollHandle?: (handle: KeyboardScrollHandle | null) => void;
}

/**
 * Translates a validated `FormConfig` into a responsive, keyboard-aware native UI tree
 * powered exclusively by `@expo/ui`.
 */
export function FormRenderer({
  externalDisabled = false,
  externalReadOnly = false,
  externalLoading = false,
  externalFormErrors,
  configIssues,
  testID,
  onBindScrollHandle,
}: FormRendererProps) {
  const { store, config, locale, isRTL, colorScheme, reducedMotion } = useActiveForm();
  const dimensions = useWindowDimensions();
  const scrollRef = useRef<KeyboardScrollHandle | null>(null);

  const setScrollRef = useCallback(
    (instance: KeyboardScrollHandle | null) => {
      scrollRef.current = instance;
      onBindScrollHandle?.(instance);
    },
    [onBindScrollHandle]
  );

  const formMeta = useFormSelector(store, [], (s) => {
    const snap = s.getState();
    const steps = s.getVisibleSteps();
    return {
      submitStatus: snap.submitStatus,
      isDirty: snap.isDirty,
      isValid: snap.isValid,
      formErrors: snap.formErrors,
      currentStepIndex: snap.currentStepIndex,
      totalSteps: steps.length,
    };
  });

  const translations = config.i18n?.translations;
  const formStyles = useMemo(
    () => resolveFormStyles(config.style, config.theme, colorScheme, isRTL),
    [config.style, config.theme, colorScheme, isRTL]
  );

  const tabletBreakpoint = config.layout?.tabletBreakpoint ?? 768;
  const isTablet = (dimensions?.width ?? 390) >= tabletBreakpoint;
  const activeColumns = isTablet
    ? (config.layout?.tabletColumns ?? config.layout?.columns ?? 1)
    : (config.layout?.columns ?? 1);

  const rowGap = config.layout?.rowGap ?? formStyles.formGap;
  const columnGap = config.layout?.columnGap ?? 12;

  const fieldLookup = useMemo(() => {
    const map = new Map<string, FieldConfig>();
    for (const f of config.fields ?? []) {
      if (f.name) map.set(f.name, f);
    }
    return map;
  }, [config.fields]);

  const renderFieldList = useCallback(
    (fields: readonly FieldConfig[], options?: FieldListRenderOptions) => {
      const prefix = options?.pathPrefix ?? '';

      // Group consecutive fields sharing an explicit `field.row` key OR chunk into responsive grid columns
      if (activeColumns > 1 && !options?.insideFieldGroup) {
        const rows: FieldConfig[][] = [];
        for (let i = 0; i < fields.length; i += activeColumns) {
          rows.push(fields.slice(i, i + activeColumns));
        }

        const cellWidthPct = `${Math.floor(100 / activeColumns) - 1}%` as `${number}%`;
        return (
          <Column spacing={rowGap} style={{ width: '100%' }}>
            {rows.map((rowFields, rIdx) => (
              <Row key={`grid-row-${rIdx}`} spacing={columnGap} style={{ width: '100%' }}>
                {rowFields.map((f, cIdx) => (
                  <Column
                    key={f.id ?? f.name ?? `cell-${rIdx}-${cIdx}`}
                    style={{
                      width: (f.width as `${number}%` | number | undefined) ?? cellWidthPct,
                    }}>
                    <FieldNodeRenderer
                      field={f}
                      pathPrefix={prefix}
                      isLastEditable={
                        rIdx === rows.length - 1 && cIdx === rowFields.length - 1
                      }
                      externalDisabled={externalDisabled}
                      externalReadOnly={externalReadOnly}
                    />
                  </Column>
                ))}
              </Row>
            ))}
          </Column>
        );
      }

      // Group adjacent fields sharing the same `row` string identifier into a horizontal `<Row>`
      const groupedBlocks: FieldConfig[][] = [];
      for (const f of fields) {
        if (f.row && groupedBlocks.length > 0) {
          const prevBlock = groupedBlocks[groupedBlocks.length - 1];
          if (prevBlock[0]?.row === f.row) {
            prevBlock.push(f);
            continue;
          }
        }
        groupedBlocks.push([f]);
      }

      // Lazy virtualized `@expo/ui` List.ForEach strategy for very large flat forms (Section 5)
      if (
        !prefix &&
        !options?.insideFieldGroup &&
        shouldUseLazyListRendering(groupedBlocks.length, config.scroll)
      ) {
        return (
          <List testID="expo-form-lazy-list">
            <List.ForEach
              data={groupedBlocks}
              keyExtractor={(block, idx) =>
                block.map((f) => f.id ?? f.name ?? idx).join('-')
              }>
              {({ item: block, index }) => (
                <Column style={{ width: '100%', paddingVertical: rowGap / 2 }}>
                  {block.length === 1 ? (
                    <FieldNodeRenderer
                      field={block[0]}
                      pathPrefix={prefix}
                      isLastEditable={index === groupedBlocks.length - 1}
                      externalDisabled={externalDisabled}
                      externalReadOnly={externalReadOnly}
                    />
                  ) : (
                    <Row spacing={columnGap} style={{ width: '100%' }}>
                      {block.map((f, cIdx) => (
                        <Column
                          key={f.id ?? f.name ?? cIdx}
                          style={{
                            width:
                              (f.width as `${number}%` | number | undefined) ??
                              (`${Math.floor(100 / block.length) - 1}%` as `${number}%`),
                          }}>
                          <FieldNodeRenderer
                            field={f}
                            pathPrefix={prefix}
                            isLastEditable={
                              index === groupedBlocks.length - 1 && cIdx === block.length - 1
                            }
                            externalDisabled={externalDisabled}
                            externalReadOnly={externalReadOnly}
                          />
                        </Column>
                      ))}
                    </Row>
                  )}
                </Column>
              )}
            </List.ForEach>
          </List>
        );
      }

      return (
        <Column spacing={rowGap} style={{ width: '100%' }}>
          {groupedBlocks.map((block, bIdx) => {
            if (block.length === 1) {
              const f = block[0];
              return (
                <FieldNodeRenderer
                  key={f.id ?? f.name ?? `field-${bIdx}`}
                  field={f}
                  pathPrefix={prefix}
                  isLastEditable={bIdx === groupedBlocks.length - 1}
                  externalDisabled={externalDisabled}
                  externalReadOnly={externalReadOnly}
                />
              );
            }

            const defaultWidth = `${Math.floor(100 / block.length) - 1}%` as `${number}%`;
            return (
              <Row
                key={`row-${block[0].row ?? bIdx}`}
                spacing={columnGap}
                style={{ width: '100%' }}>
                {block.map((f, cIdx) => (
                  <Column
                    key={f.id ?? f.name ?? `col-${bIdx}-${cIdx}`}
                    style={{
                      width: (f.width as `${number}%` | number | undefined) ?? defaultWidth,
                    }}>
                    <FieldNodeRenderer
                      field={f}
                      pathPrefix={prefix}
                      isLastEditable={
                        bIdx === groupedBlocks.length - 1 && cIdx === block.length - 1
                      }
                      externalDisabled={externalDisabled}
                      externalReadOnly={externalReadOnly}
                    />
                  </Column>
                ))}
              </Row>
            );
          })}
        </Column>
      );
    },
    [
      activeColumns,
      rowGap,
      columnGap,
      externalDisabled,
      externalReadOnly,
      config.scroll,
    ]
  );

  // Explicit `layout.rows` support (array of field-name tuples)
  const fieldsOrderedByLayout = useMemo(() => {
    const baseFields = config.fields ?? [];
    if (!config.layout?.rows?.length) return baseFields;

    const result: FieldConfig[] = [];
    const consumed = new Set<string>();

    config.layout.rows.forEach((rowNames, rIdx) => {
      const rowKey = `layout_row_${rIdx}`;
      for (const name of rowNames) {
        const f = fieldLookup.get(name);
        if (f) {
          consumed.add(name);
          result.push(rowNames.length > 1 ? { ...f, row: f.row ?? rowKey } : f);
        }
      }
    });

    for (const f of baseFields) {
      if (!f.name || !consumed.has(f.name)) {
        result.push(f);
      }
    }

    return result;
  }, [config.fields, config.layout?.rows, fieldLookup]);

  const titleText = resolveLocalizedText(config.title, locale, translations);
  const descText = resolveLocalizedText(config.description, locale, translations);

  const allFormErrors = [
    ...(externalFormErrors ?? []),
    ...formMeta.formErrors,
  ];

  const isLoading = externalLoading || formMeta.submitStatus === 'loading';
  const isWizardIntermediateStep =
    formMeta.totalSteps > 0 && formMeta.currentStepIndex < formMeta.totalSteps - 1;

  const submitHidden =
    config.submit?.hidden === true || externalReadOnly || config.readOnly === true || isWizardIntermediateStep;

  const submitDisabled =
    externalDisabled ||
    config.disabled === true ||
    isLoading ||
    (config.submit?.disableUntilDirty === true && !formMeta.isDirty) ||
    (config.submit?.disableWhenInvalid === true && !formMeta.isValid);

  const submitLabel = useMemo(() => {
    if (isLoading) {
      return (
        resolveLocalizedText(config.submit?.loadingLabel, locale, translations) ??
        'Submitting...'
      );
    }
    if (formMeta.submitStatus === 'success' && config.submit?.successLabel) {
      return resolveLocalizedText(config.submit.successLabel, locale, translations) ?? 'Submitted';
    }
    return resolveLocalizedText(config.submit?.label, locale, translations) ?? 'Submit';
  }, [
    isLoading,
    formMeta.submitStatus,
    config.submit?.loadingLabel,
    config.submit?.successLabel,
    config.submit?.label,
    locale,
    translations,
  ]);

  const resetLabel =
    resolveLocalizedText(config.submit?.resetLabel, locale, translations) ?? 'Reset';

  const formEnterAnim = resolveAnimationTrigger(config.animations, 'formEnter', {
    reducedMotion,
  });
  const formModifiers = buildNativeAnimationModifiers(formEnterAnim, true);

  return (
    <FieldRenderDelegateContext.Provider value={renderFieldList}>
      <KeyboardLayoutAdapter
        ref={setScrollRef}
        scrollConfig={config.scroll}
        formStyle={formStyles.formBox}
        formGap={formStyles.formGap}
        formAlignment={formStyles.formAlignment}
        formModifiers={formModifiers}
        testID={testID ?? `expo-form-${config.id}`}>
        {/* Header: Title & Description */}
        {titleText || descText ? (
          <Column spacing={6} style={{ width: '100%' }}>
            {titleText ? (
              <Text testID="expo-form-title" textStyle={formStyles.titleStyle}>
                {titleText}
              </Text>
            ) : null}
            {descText ? (
              <Text testID="expo-form-description" textStyle={formStyles.descriptionStyle}>
                {descText}
              </Text>
            ) : null}
          </Column>
        ) : null}

        {/* Non-fatal config warnings if any */}
        {configIssues && configIssues.length > 0 ? (
          <Column spacing={4} style={formStyles.formErrorBox} testID="expo-form-config-warnings">
            {configIssues.map((issue, idx) => (
              <Text key={`${issue.path}-${idx}`} textStyle={formStyles.formErrorText}>
                {`[${issue.path}] ${issue.message}`}
              </Text>
            ))}
          </Column>
        ) : null}

        {/* Form-level validation / server errors */}
        {allFormErrors.length > 0 ? (
          <Column spacing={4} style={formStyles.formErrorBox} testID="expo-form-errors">
            {allFormErrors.map((msg, idx) => (
              <Text key={`${idx}-${msg}`} textStyle={formStyles.formErrorText}>
                {msg}
              </Text>
            ))}
          </Column>
        ) : null}

        {/* Body: Wizard steps -> Sections -> Flat Fields */}
        {config.steps?.length ? (
          <StepWizardRenderer steps={config.steps} />
        ) : config.sections?.length ? (
          <Column spacing={formStyles.formGap} style={{ width: '100%' }}>
            {config.sections.map((sec) => (
              <SectionRenderer
                key={sec.id}
                section={sec}
                fieldLookup={fieldLookup}
              />
            ))}
          </Column>
        ) : (
          renderFieldList(fieldsOrderedByLayout)
        )}

        {/* Submit & Reset Action Controls */}
        {!submitHidden ? (
          <Column spacing={10} style={{ width: '100%', paddingTop: 4 }}>
            <Button
              variant={(config.submit?.variant as 'filled' | 'outlined' | 'text') ?? formStyles.submitVariant}
              disabled={submitDisabled}
              testID="expo-form-submit-button"
              onPress={() => {
                void store.submit();
              }}
              style={formStyles.submitBox}>
              <Text textStyle={formStyles.submitText}>{submitLabel}</Text>
            </Button>

            {config.submit?.showReset ? (
              <Button
                variant="outlined"
                disabled={externalDisabled || isLoading}
                testID="expo-form-reset-button"
                onPress={() => store.reset()}
                style={formStyles.resetBox}>
                <Text textStyle={formStyles.resetText}>{resetLabel}</Text>
              </Button>
            ) : null}
          </Column>
        ) : null}
      </KeyboardLayoutAdapter>
    </FieldRenderDelegateContext.Provider>
  );
}
