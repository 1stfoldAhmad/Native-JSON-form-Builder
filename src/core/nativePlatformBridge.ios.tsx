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
  ignoreSafeArea,
  privacySensitive,
  scrollDismissesKeyboard,
  scrollPosition,
  scrollTargetLayout,
} from '@expo/ui/swift-ui/modifiers';

import type { AnimationItemConfig } from '../types';
import type {
  AnchorLayoutRect,
  PlatformA11yParams,
  PlatformScrollAnchorHandle,
} from './nativePlatformBridge';

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
  keyboardAware = true,
  _onContainerMeasured?: (rect: AnchorLayoutRect) => void
): { scrollModifiers: any[]; contentModifiers: any[] } {
  const scrollModifiers: any[] = [
    scrollDismissesKeyboard(dismissOnDrag ? 'interactively' : 'never'),
    scrollPosition(scrollTargetState as unknown as Parameters<typeof scrollPosition>[0], {
      anchor: 'center',
    }),
  ];
  // SwiftUI ScrollView applies keyboard safe-area avoidance automatically by default.
  // When `scroll.keyboardAware === false`, explicitly opt out of `.keyboard` safe-area insets
  // so iOS and Android (`imePadding()`) honor `keyboardAware` identically.
  if (!keyboardAware) {
    scrollModifiers.push(ignoreSafeArea({ regions: 'keyboard' }));
  }
  return {
    scrollModifiers,
    contentModifiers: [scrollTargetLayout()],
  };
}

export function getPlatformFieldAnchorModifiers(
  anchorId: string,
  _onAnchorMeasured?: (rect: AnchorLayoutRect) => void
): any[] {
  return [swiftIdModifier(anchorId)];
}

export function renderPlatformScrollAnchor(_props: {
  anchorId: string;
  onRegister?: (anchorId: string, handle: PlatformScrollAnchorHandle | null) => void;
}): ReactElement | null {
  return null;
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

export function getPlatformSensitiveInputModifiers(
  sensitive: boolean,
  _fieldTypeHint?: string
): any[] | undefined {
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
