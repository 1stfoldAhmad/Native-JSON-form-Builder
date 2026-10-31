import { useEffect, useRef, type ReactElement } from 'react';
import {
  TextInput,
  useNativeState,
  type ObservableState,
  type TextInputRef,
} from '@expo/ui';
import {
  animateContentSize,
  graphicsLayer,
  imePadding,
  onGloballyPositioned,
  semantics,
  size,
  testID,
} from '@expo/ui/jetpack-compose/modifiers';

import type { AnimationItemConfig } from '../types';
import type {
  AnchorLayoutRect,
  PlatformA11yParams,
  PlatformScrollAnchorHandle,
} from './nativePlatformBridge';

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
  keyboardAware = true,
  onContainerMeasured?: (rect: AnchorLayoutRect) => void
): { scrollModifiers: any[]; contentModifiers: any[] } {
  return {
    scrollModifiers: onContainerMeasured ? [onGloballyPositioned(onContainerMeasured)] : [],
    contentModifiers: keyboardAware ? [imePadding()] : [],
  };
}

/**
 * Attaches a Jetpack Compose `testTag` (`testID`) and optional `onGloballyPositioned`
 * coordinate measurement modifier so every `FieldWrapper` is addressable and measurable on Android.
 */
export function getPlatformFieldAnchorModifiers(
  anchorId: string,
  onAnchorMeasured?: (rect: AnchorLayoutRect) => void
): any[] {
  const mods: any[] = [testID(anchorId)];
  if (onAnchorMeasured) {
    mods.push(onGloballyPositioned(onAnchorMeasured));
  }
  return mods;
}

function AndroidComposeScrollAnchor({
  anchorId,
  onRegister,
}: {
  anchorId: string;
  onRegister?: (anchorId: string, handle: PlatformScrollAnchorHandle | null) => void;
}) {
  const anchorRef = useRef<TextInputRef>(null);
  const emptyState = useNativeState<string>('');

  useEffect(() => {
    if (!onRegister) return undefined;
    onRegister(anchorId, {
      bringIntoView: () => anchorRef.current?.focus(),
    });
    return () => {
      onRegister(anchorId, null);
    };
  }, [anchorId, onRegister]);

  return (
    <TextInput
      ref={anchorRef}
      value={emptyState}
      editable={false}
      readOnly
      caretHidden
      testID={`${anchorId}-scroll-anchor`}
      modifiers={[size(1, 1), graphicsLayer({ alpha: 0 })]}
      style={{
        width: 1,
        height: 1,
        paddingHorizontal: 0,
        paddingVertical: 0,
        borderWidth: 0,
        backgroundColor: 'transparent',
      }}
    />
  );
}

/**
 * `@expo/ui`'s Android `ScrollView` wraps Jetpack Compose `Column` + `verticalScroll(rememberScrollState())`
 * without exposing an external `ScrollState` target prop. Mounting a `1x1dp` transparent `readOnly`
 * Compose `BasicTextField` anchor per `FieldWrapper` lets `scrollToField` invoke Compose's native
 * `FocusRequester` -> `BringIntoViewRequester` for any field (including non-text controls like
 * checkboxes, selects, sliders, and uploads) without opening the Android soft keyboard.
 */
export function renderPlatformScrollAnchor(props: {
  anchorId: string;
  onRegister?: (anchorId: string, handle: PlatformScrollAnchorHandle | null) => void;
}): ReactElement | null {
  if (!props.onRegister) return null;
  return (
    <AndroidComposeScrollAnchor
      anchorId={props.anchorId}
      onRegister={props.onRegister}
    />
  );
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

function mapSensitiveFieldContentType(fieldTypeHint?: string): string {
  switch (fieldTypeHint) {
    case 'newPassword':
    case 'confirmPassword':
      return 'new-password';
    case 'otp':
      return 'one-time-code';
    case 'creditCard':
      return 'cc-number';
    case 'cvv':
      return 'cc-csc';
    default:
      return 'password';
  }
}

/**
 * Applies Jetpack Compose `semantics({ contentType })` credential classification on Android
 * so Autofill & accessibility services treat sensitive inputs (including custom fields marked
 * `"sensitive": true`) as credential data rather than indexing cleartext autofill history.
 *
 * Note: Unlike iOS SwiftUI `privacySensitive()`, Android OS enforces screenshot and Recent Apps
 * switcher redaction at the Activity `Window` level (`WindowManager.LayoutParams.FLAG_SECURE`,
 * e.g. via `expo-screen-capture`), which is documented in `README.md`.
 */
export function getPlatformSensitiveInputModifiers(
  sensitive: boolean,
  fieldTypeHint?: string
): any[] | undefined {
  if (!sensitive) return undefined;
  return [
    semantics({
      contentType: mapSensitiveFieldContentType(fieldTypeHint),
    }),
  ];
}

export function renderNativePlatformColorPicker(_props: {
  color: string;
  supportsOpacity: boolean;
  onSelectColor: (hex: string) => void;
}): ReactElement | null {
  return null;
}
