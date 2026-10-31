import { Button, Column, Row, Spacer, Text } from '@expo/ui';

import {
  buildNativeAnimationModifiers,
  resolveAnimationTrigger,
} from '../animations/AnimationAdapter';
import { useActiveForm } from '../core/context';
import { useFormSelector } from '../state/useFormSelector';
import { resolveFormStyles } from '../styles/StyleResolver';
import type { FormStepConfig } from '../types';
import { resolveLocalizedText } from '../utils/formatting';
import { useRenderFieldList } from './renderDelegate';

export interface StepWizardRendererProps {
  steps: readonly FormStepConfig[];
}

/**
 * Native multi-step wizard renderer (`stepGroup` / `config.steps`).
 * Supports step indicators, per-step validation before advancing, and Previous/Next navigation.
 */
export function StepWizardRenderer({ steps }: StepWizardRendererProps) {
  const { store, config, locale, colorScheme, isRTL, reducedMotion } = useActiveForm();
  const renderFieldList = useRenderFieldList();
  const translations = config.i18n?.translations;

  const currentStepIndex = useFormSelector(store, [], (s) => s.getCurrentStepIndex());
  const visibleSteps = useFormSelector(store, [], (s) => s.getVisibleSteps());
  const effectiveSteps = visibleSteps.length > 0 ? visibleSteps : steps;

  const safeIdx = Math.min(Math.max(0, currentStepIndex), Math.max(0, effectiveSteps.length - 1));
  const activeStep = effectiveSteps[safeIdx];

  const formStyles = resolveFormStyles(config.style, config.theme, colorScheme, isRTL);
  const stepAnim = resolveAnimationTrigger(config.animations, 'stepTransition', {
    reducedMotion,
  });
  const stepModifiers = buildNativeAnimationModifiers(stepAnim, safeIdx);

  if (!activeStep) return null;

  const isFirst = safeIdx === 0;
  const isLast = safeIdx === effectiveSteps.length - 1;

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
                disabled={idx > safeIdx}
                testID={`wizard-indicator-${step.id}`}
                onPress={() => {
                  if (idx < safeIdx) {
                    void store.goToStep(idx);
                  }
                }}
                style={{
                  height: 30,
                  borderRadius: 15,
                  paddingHorizontal: 12,
                  opacity: active ? 1 : completed ? 0.85 : 0.55,
                }}>
                <Text
                  textStyle={{
                    fontSize: 12,
                    fontWeight: '600',
                    color:
                      active || completed
                        ? '#FFFFFF'
                        : formStyles.palette.textSecondary,
                  }}>
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
        modifiers={stepModifiers.length > 0 ? stepModifiers : undefined}>
        {renderFieldList(activeStep.fields)}
      </Column>

      {/* Step navigation controls (final step lets main Submit button or Next button operate) */}
      <Row spacing={10} alignment="center" style={{ width: '100%' }}>
        {!isFirst ? (
          <Button
            variant="outlined"
            label={activeStep.previousLabel ?? 'Previous'}
            testID="wizard-prev-button"
            onPress={() => store.previousStep()}
            style={{ height: 48, borderRadius: 12, paddingHorizontal: 18 }}
          />
        ) : null}

        <Spacer flexible />

        {!isLast ? (
          <Button
            variant="filled"
            label={activeStep.nextLabel ?? 'Next'}
            testID="wizard-next-button"
            onPress={() => void store.nextStep()}
            style={{ height: 48, borderRadius: 12, paddingHorizontal: 22 }}
          />
        ) : null}
      </Row>
    </Column>
  );
}
