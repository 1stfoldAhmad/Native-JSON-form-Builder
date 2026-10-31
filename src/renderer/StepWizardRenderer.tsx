import { useState } from 'react';
import { Button, Column, Row, Spacer, Text } from '@expo/ui';

import {
  buildNativeAnimationModifiers,
  resolveAnimationTrigger,
} from '../animations/AnimationAdapter';
import { evaluateCondition } from '../conditions/evaluator';
import { useActiveForm } from '../core/context';
import { useFormSelector } from '../state/useFormSelector';
import { resolveFormStyles } from '../styles/StyleResolver';
import type { FormStepConfig } from '../types';
import { resolveLocalizedText } from '../utils/formatting';
import { useRenderFieldList } from './renderDelegate';

export interface StepWizardRendererProps {
  steps: readonly FormStepConfig[];
  inline?: boolean;
}

/**
 * Native multi-step wizard renderer (`stepGroup` / `config.steps`).
 * Supports step indicators, per-step validation before advancing, and Previous/Next navigation.
 * When used as an inline `stepGroup` inside a larger non-wizard form, manages local step navigation
 * without hiding the parent form's main submit button.
 */
export function StepWizardRenderer({ steps, inline = false }: StepWizardRendererProps) {
  const { store, config, locale, colorScheme, isRTL, reducedMotion } = useActiveForm();
  const renderFieldList = useRenderFieldList();
  const translations = config.i18n?.translations;

  const isTopLevelWizard = !inline && Boolean(config.steps?.length);
  const [localStepIndex, setLocalStepIndex] = useState(0);

  const storeStepIndex = useFormSelector(store, [], (s) => s.getCurrentStepIndex());
  const effectiveSteps = useFormSelector(store, [], (s) => {
    if (isTopLevelWizard) {
      const vis = s.getVisibleSteps();
      return vis.length > 0 ? vis : steps;
    }
    const vals = s.getValuesRef();
    const filtered = steps.filter(
      (st) => !st.visibleWhen || evaluateCondition(st.visibleWhen, vals)
    );
    return filtered.length > 0 ? filtered : steps;
  });

  const rawIndex = isTopLevelWizard ? storeStepIndex : localStepIndex;
  const safeIdx = Math.min(Math.max(0, rawIndex), Math.max(0, effectiveSteps.length - 1));
  const activeStep = effectiveSteps[safeIdx];

  const formStyles = resolveFormStyles(config.style, config.theme, colorScheme, isRTL);
  const stepAnim = resolveAnimationTrigger(config.animations, 'stepTransition', {
    reducedMotion,
  });
  const stepModifiers = buildNativeAnimationModifiers(stepAnim, safeIdx);

  if (!activeStep) return null;

  const isFirst = safeIdx === 0;
  const isLast = safeIdx === effectiveSteps.length - 1;

  const handleGoTo = (idx: number) => {
    if (isTopLevelWizard) {
      void store.goToStep(idx);
    } else {
      setLocalStepIndex(idx);
    }
  };

  const handlePrev = () => {
    if (isTopLevelWizard) {
      store.previousStep();
    } else {
      setLocalStepIndex((prev) => Math.max(0, prev - 1));
    }
  };

  const handleNext = () => {
    if (isTopLevelWizard) {
      void store.nextStep();
    } else {
      setLocalStepIndex((prev) => Math.min(effectiveSteps.length - 1, prev + 1));
    }
  };

  return (
    <Column spacing={16} style={{ width: '100%' }} testID={`wizard-step-${activeStep.id}`}>
      {/* Step progress header */}
      <Column spacing={8} style={{ width: '100%' }}>
        <Row spacing={6} alignment="center" style={{ width: '100%' }}>
          {effectiveSteps.map((step, idx) => {
            const active = idx === safeIdx;
            const completed = idx < safeIdx;
            return (
              <Button
                key={step.id}
                variant={active || completed ? 'filled' : 'outlined'}
                disabled={isTopLevelWizard ? idx > safeIdx : false}
                testID={`wizard-indicator-${step.id}`}
                onPress={() => {
                  if (!isTopLevelWizard || idx < safeIdx) {
                    handleGoTo(idx);
                  }
                }}
                style={{
                  height: 30,
                  borderRadius: 15,
                  paddingHorizontal: 12,
                  opacity: active ? 1 : completed ? 0.85 : 0.65,
                }}
              >
                <Text
                  textStyle={{
                    fontSize: 12,
                    fontWeight: '600',
                    color:
                      active || completed
                        ? '#FFFFFF'
                        : formStyles.palette.textSecondary,
                  }}
                >
                  {`${idx + 1}. ${resolveLocalizedText(step.title, locale, translations) ?? step.title}`}
                </Text>
              </Button>
            );
          })}
        </Row>

        {activeStep.description ? (
          <Text textStyle={formStyles.sectionDescriptionStyle}>
            {resolveLocalizedText(activeStep.description, locale, translations) ??
              activeStep.description}
          </Text>
        ) : null}
      </Column>

      {/* Active step fields */}
      <Column
        spacing={formStyles.sectionGap}
        style={{ width: '100%' }}
        modifiers={stepModifiers.length > 0 ? stepModifiers : undefined}
      >
        {renderFieldList(activeStep.fields)}
      </Column>

      {/* Step navigation controls */}
      <Row spacing={10} alignment="center" style={{ width: '100%' }}>
        {!isFirst ? (
          <Button
            variant="outlined"
            label={activeStep.previousLabel ?? 'Previous'}
            testID="wizard-prev-button"
            onPress={handlePrev}
            style={{ height: 48, borderRadius: 12, paddingHorizontal: 18 }}
          />
        ) : null}

        <Spacer flexible />

        {!isLast ? (
          <Button
            variant="filled"
            label={activeStep.nextLabel ?? 'Next'}
            testID="wizard-next-button"
            onPress={handleNext}
            style={{ height: 48, borderRadius: 12, paddingHorizontal: 22 }}
          />
        ) : null}
      </Row>
    </Column>
  );
}
