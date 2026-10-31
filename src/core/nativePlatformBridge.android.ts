import type { ReactElement } from 'react';
import type { ObservableState } from '@expo/ui';
import {
  animateContentSize,
  graphicsLayer,
  imePadding,
  semantics,
} from '@expo/ui/jetpack-compose/modifiers';

import type { AnimationItemConfig } from '../types';
import type { PlatformA11yParams } from './nativePlatformBridge';

export function getPlatformAnimationModifiers(
  animConfig: AnimationItemConfig | null,
  animatedValue: number | boolean,
  preventLayoutJumps = true
): any[] {
  if (!animConfig) return [];
  const modifiers: any[] = [];
  if (preventLayoutJumps) {
    modifiers.push(
      animateContentSize(animConfig.damping ?? 0.85, animConfig.stiffness ?? 400)
    );
  }
  if (
    animConfig.type === 'scale' &&
    animConfig.initialScale !== undefined &&
    !animatedValue
  ) {
    modifiers.push(
      graphicsLayer({
        scaleX: animConfig.initialScale,
        scaleY: animConfig.initialScale,
      })
    );
  }
  return modifiers;
}

export function getPlatformScrollContainerModifiers(
  _dismissOnDrag: boolean,
  _scrollTargetState: ObservableState<string | null>,
  keyboardAware = true
): { scrollModifiers: any[]; contentModifiers: any[] } {
  return {
    scrollModifiers: [],
    contentModifiers: keyboardAware ? [imePadding()] : [],
  };
}

export function getPlatformFieldAnchorModifiers(_anchorId: string): any[] {
  return [];
}

export function getPlatformFieldA11yModifiers(params: PlatformA11yParams): any[] {
  const parts = [params.label];
  if (params.validating) parts.push('Validating');
  if (params.error) parts.push(`Error: ${params.error}`);
  return [
    semantics({
      contentDescription: parts.join('. '),
    }),
  ];
}

export function getPlatformHeadingModifiers(text: string): any[] | undefined {
  return [semantics({ contentDescription: `Heading: ${text}` })];
}

export function getPlatformSensitiveInputModifiers(_sensitive: boolean): any[] | undefined {
  return undefined;
}

export function renderNativePlatformColorPicker(_props: {
  color: string;
  supportsOpacity: boolean;
  onSelectColor: (hex: string) => void;
}): ReactElement | null {
  return null;
}
