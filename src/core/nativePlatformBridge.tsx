import type { ReactElement } from 'react';
import type { ObservableState } from '@expo/ui';

import type { AnimationItemConfig } from '../types';

export interface PlatformA11yParams {
  label: string;
  hint?: string;
  error?: string;
  validating?: boolean;
}

export interface AnchorLayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlatformScrollAnchorHandle {
  bringIntoView: () => Promise<void> | void;
}

/**
 * Web / default implementation of platform-specific native modifiers.
 * On iOS and Android, Metro resolves `nativePlatformBridge.ios.tsx` and
 * `nativePlatformBridge.android.tsx` directly to SwiftUI and Jetpack Compose modifiers.
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
  _keyboardAware = true,
  _onContainerMeasured?: (rect: AnchorLayoutRect) => void
): { scrollModifiers: any[]; contentModifiers: any[] } {
  return { scrollModifiers: [], contentModifiers: [] };
}

export function getPlatformFieldAnchorModifiers(
  _anchorId: string,
  _onAnchorMeasured?: (rect: AnchorLayoutRect) => void
): any[] {
  return [];
}

export function renderPlatformScrollAnchor(_props: {
  anchorId: string;
  onRegister?: (anchorId: string, handle: PlatformScrollAnchorHandle | null) => void;
}): ReactElement | null {
  return null;
}

export function getPlatformFieldA11yModifiers(_params: PlatformA11yParams): any[] {
  return [];
}

export function getPlatformHeadingModifiers(_text: string): any[] | undefined {
  return undefined;
}

export function getPlatformSensitiveInputModifiers(
  _sensitive: boolean,
  _fieldTypeHint?: string
): any[] | undefined {
  return undefined;
}

export function renderNativePlatformColorPicker(_props: {
  color: string;
  supportsOpacity: boolean;
  onSelectColor: (hex: string) => void;
}): ReactElement | null {
  return null;
}
