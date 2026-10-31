import { useMemo, useState } from 'react';
import { Collapsible, Column, FieldGroup, Text } from '@expo/ui';

import {
  evaluateCondition,
  extractConditionFieldPaths,
} from '../conditions/evaluator';
import { useActiveForm } from '../core/context';
import { useFormSelector } from '../state/useFormSelector';
import { resolveFormStyles } from '../styles/StyleResolver';
import type { FieldConfig, FormSectionConfig } from '../types';
import { resolveLocalizedText } from '../utils/formatting';
import { useRenderFieldList } from './renderDelegate';

export interface SectionRendererProps {
  section: FormSectionConfig;
  fieldLookup: ReadonlyMap<string, FieldConfig>;
}

/**
 * Renders a top-level `FormSectionConfig`, supporting:
 * - Conditional section visibility (`visibleWhen`, `hiddenWhen`)
 * - Expandable/collapsible sections (`@expo/ui` `Collapsible`)
 * - Native settings-grouped layout (`@expo/ui` `FieldGroup` + `FieldGroup.Section`)
 * - Styled card or plain vertical section containers
 */
export function SectionRenderer({ section, fieldLookup }: SectionRendererProps) {
  const { store, config, locale, colorScheme, isRTL } = useActiveForm();
  const renderFieldList = useRenderFieldList();
  const [expanded, setExpanded] = useState(section.defaultExpanded ?? true);

  const watchedDeps = useMemo(() => {
    const acc = new Set<string>();
    extractConditionFieldPaths(section.visibleWhen, acc);
    extractConditionFieldPaths(section.hiddenWhen, acc);
    return Array.from(acc);
  }, [section.visibleWhen, section.hiddenWhen]);

  const isVisible = useFormSelector(store, watchedDeps, (s) => {
    const vals = s.getValuesRef();
    if (section.visibleWhen && !evaluateCondition(section.visibleWhen, vals)) return false;
    if (section.hiddenWhen && evaluateCondition(section.hiddenWhen, vals)) return false;
    return true;
  });

  const resolvedFields = useMemo(() => {
    const list: FieldConfig[] = [];
    for (const item of section.fields) {
      if (typeof item === 'string') {
        const found = fieldLookup.get(item);
        if (found) list.push(found);
      } else {
        list.push(item);
      }
    }
    return list;
  }, [section.fields, fieldLookup]);

  if (!isVisible || resolvedFields.length === 0) {
    return null;
  }

  const translations = config.i18n?.translations;
  const title = resolveLocalizedText(section.title, locale, translations);
  const description = resolveLocalizedText(section.description, locale, translations);
  const footer = resolveLocalizedText(section.footer, locale, translations);
  const formStyles = resolveFormStyles(config.style, config.theme, colorScheme, isRTL);

  if (section.variant === 'fieldGroup') {
    return (
      <FieldGroup style={{ width: '100%' }} testID={`section-${section.id}`}>
        <FieldGroup.Section title={title}>
          {renderFieldList(resolvedFields, { insideFieldGroup: true })}
          {footer ? (
            <FieldGroup.SectionFooter>
              <Text textStyle={formStyles.sectionDescriptionStyle}>{footer}</Text>
            </FieldGroup.SectionFooter>
          ) : null}
        </FieldGroup.Section>
      </FieldGroup>
    );
  }

  const body = (
    <Column spacing={formStyles.sectionGap} style={{ width: '100%' }}>
      {description ? <Text textStyle={formStyles.sectionDescriptionStyle}>{description}</Text> : null}
      {renderFieldList(resolvedFields)}
      {footer ? <Text textStyle={formStyles.sectionDescriptionStyle}>{footer}</Text> : null}
    </Column>
  );

  if (section.collapsible) {
    return (
      <Column spacing={10} style={formStyles.sectionBox} testID={`section-${section.id}`}>
        <Collapsible
          isOpen={expanded}
          onOpenChange={setExpanded}
          label={title ?? section.id}
          labelStyle={formStyles.sectionHeaderStyle}>
          {body}
        </Collapsible>
      </Column>
    );
  }

  return (
    <Column
      spacing={formStyles.sectionGap}
      style={section.variant === 'card' || config.style?.section ? formStyles.sectionBox : { width: '100%' }}
      testID={`section-${section.id}`}>
      {title ? <Text textStyle={formStyles.sectionHeaderStyle}>{title}</Text> : null}
      {body}
    </Column>
  );
}
