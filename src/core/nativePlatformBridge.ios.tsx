import type { ReactElement } from 'react';
import type { ObservableState } from '@expo/ui';
import { ColorPicker as SwiftUIColorPicker } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityHint,
  accessibilityLabel,
  accessibilityValue,
  Animation as SwiftAnimation,
  animation as swiftAnimationModifier,
  id as swiftIdModifier,
  privacySensitive,
  scrollDismissesKeyboard,
  scrollPosition,
  scrollTargetLayout,
} from '@expo/ui/swift-ui/modifiers';

import type { AnimationItemConfig } from '../types';
import type { PlatformA11yParams } from './nativePlatformBridge';

export function getPlatformAnimationModifiers(
  animConfig: AnimationItemConfig | null,
  animatedValue: number | boolean,
  _preventLayoutJumps = true
): any[] {
  if (!animConfig) return [];

  const durationSec = (animConfig.duration ?? 240) / 1000;
  const delaySec = animConfig.delay ? animConfig.delay / 1000 : 0;

  let chain = (() => {
    switch (animConfig.type) {
      case 'spring':
        return SwiftAnimation.spring({
          duration: durationSec,
          dampingFraction: animConfig.damping ?? 0.82,
          bounce: animConfig.bounce,
        });
      case 'smooth':
        return SwiftAnimation.smooth({
          duration: durationSec,
          extraBounce: animConfig.bounce,
        });
      case 'snappy':
        return SwiftAnimation.snappy({
          duration: durationSec,
          extraBounce: animConfig.bounce,
        });
      case 'bouncy':
        return SwiftAnimation.bouncy({
          duration: durationSec,
          extraBounce: animConfig.bounce,
        });
      case 'easeIn':
        return SwiftAnimation.easeIn({ duration: durationSec });
      case 'easeOut':
        return SwiftAnimation.easeOut({ duration: durationSec });
      case 'linear':
        return SwiftAnimation.linear({ duration: durationSec });
      default:
        return SwiftAnimation.easeInOut({ duration: durationSec });
    }
  })();

  if (delaySec > 0) {
    chain = chain.delay(delaySec);
  }

  return [swiftAnimationModifier(chain, animatedValue)];
}

export function getPlatformScrollContainerModifiers(
  dismissOnDrag: boolean,
  scrollTargetState: ObservableState<string | null>,
  _keyboardAware = true
): { scrollModifiers: any[]; contentModifiers: any[] } {
  return {
    scrollModifiers: [
      scrollDismissesKeyboard(dismissOnDrag ? 'interactively' : 'never'),
      scrollPosition(scrollTargetState as unknown as Parameters<typeof scrollPosition>[0], {
        anchor: 'center',
      }),
    ],
    contentModifiers: [scrollTargetLayout()],
  };
}

export function getPlatformFieldAnchorModifiers(anchorId: string): any[] {
  return [swiftIdModifier(anchorId)];
}

export function getPlatformFieldA11yModifiers(params: PlatformA11yParams): any[] {
  const mods: any[] = [accessibilityLabel(params.label)];
  if (params.hint) mods.push(accessibilityHint(params.hint));
  if (params.error) mods.push(accessibilityValue(`Error: ${params.error}`));
  return mods;
}

export function getPlatformHeadingModifiers(_text: string): any[] | undefined {
  return [accessibilityAddTraits(['isHeader'])];
}

export function getPlatformSensitiveInputModifiers(sensitive: boolean): any[] | undefined {
  return sensitive ? [privacySensitive(true)] : undefined;
}

export function renderNativePlatformColorPicker(props: {
  color: string;
  supportsOpacity: boolean;
  onSelectColor: (hex: string) => void;
}): ReactElement | null {
  return (
    <SwiftUIColorPicker
      selection={props.color}
      supportsOpacity={props.supportsOpacity}
      label="Pick color"
      onSelectionChange={props.onSelectColor}
    />
  );
}
