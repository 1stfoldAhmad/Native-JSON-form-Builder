import type { ReactElement } from 'react';
import type { ObservableState } from '@expo/ui';

import type { AnimationItemConfig } from '../types';

export interface PlatformA11yParams {
  label: string;
  hint?: string;
  error?: string;
  validating?: boolean;
}

/**
 * Web / default implementation of platform-specific native modifiers.
 * On iOS and Android, Metro resolves `nativePlatformBridge.ios.tsx` and
 * `nativePlatformBridge.android.ts` directly to SwiftUI and Jetpack Compose modifiers.
 */
export function getPlatformAnimationModifiers(
  _animConfig: AnimationItemConfig | null,
  _animatedValue: number | boolean,
  _preventLayoutJumps = true
): any[] {
  return [];
}

export function getPlatformScrollContainerModifiers(
  _dismissOnDrag: boolean,
  _scrollTargetState: ObservableState<string | null>,
  _keyboardAware = true
): { scrollModifiers: any[]; contentModifiers: any[] } {
  return { scrollModifiers: [], contentModifiers: [] };
}

export function getPlatformFieldAnchorModifiers(_anchorId: string): any[] {
  return [];
}

export function getPlatformFieldA11yModifiers(_params: PlatformA11yParams): any[] {
  return [];
}

export function getPlatformHeadingModifiers(_text: string): any[] | undefined {
  return undefined;
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
