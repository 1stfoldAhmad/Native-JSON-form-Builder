import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  type ReactNode,
} from 'react';
import { Keyboard } from 'react-native';
import {
  Column,
  ScrollView,
  useNativeState,
  type UniversalStyle,
} from '@expo/ui';

import {
  getPlatformFieldAnchorModifiers,
  getPlatformScrollContainerModifiers,
} from '../core/nativePlatformBridge';
import type {
  FieldRendererProps,
  FieldType,
  FormKeyboardConfig,
  FormScrollConfig,
} from '../types';

export type FieldReturnKeyType = NonNullable<FieldRendererProps['returnKeyType']>;

export interface KeyboardScrollHandle {
  scrollToField: (fieldPath: string) => void;
}

export interface KeyboardLayoutAdapterProps {
  children: ReactNode;
  scrollConfig?: FormScrollConfig;
  formStyle?: UniversalStyle;
  formGap?: number;
  formAlignment?: 'start' | 'center' | 'end';
  formModifiers?: any[];
  testID?: string;
}

export function getFieldScrollAnchorId(fieldPath: string): string {
  return `expo-form-field-${fieldPath}`;
}

export function buildFieldScrollTargetModifiers(fieldPath: string): any[] {
  return getPlatformFieldAnchorModifiers(getFieldScrollAnchorId(fieldPath));
}

export function shouldUseLazyListRendering(
  blockCount: number,
  scrollConfig?: FormScrollConfig
): boolean {
  if (scrollConfig?.lazyRendering === true) return true;
  if (scrollConfig?.lazyRendering === false) return false;
  const threshold =
    typeof scrollConfig?.lazyRendering === 'number' ? scrollConfig.lazyRendering : 35;
  return blockCount >= threshold;
}

function isValidReturnKeyType(val?: string): val is FieldReturnKeyType {
  return (
    val === 'default' ||
    val === 'done' ||
    val === 'go' ||
    val === 'next' ||
    val === 'search' ||
    val === 'send'
  );
}

export function resolveFieldReturnKeyType(
  explicit: string | undefined,
  fieldType: FieldType,
  isLastEditable: boolean | undefined,
  keyboardConfig?: FormKeyboardConfig
): FieldReturnKeyType {
  if (isValidReturnKeyType(explicit)) {
    return explicit;
  }
  if (fieldType === 'search' || fieldType === 'locationSearch') return 'search';
  if (fieldType === 'textarea') return 'default';
  if (isLastEditable) {
    const last = keyboardConfig?.lastFieldReturnKeyType;
    return isValidReturnKeyType(last) ? last : 'done';
  }
  const def = keyboardConfig?.defaultReturnKeyType;
  return isValidReturnKeyType(def) ? def : 'next';
}

export function dismissNativeKeyboard(): void {
  try {
    Keyboard.dismiss();
  } catch {
    // Safe no-op in non-native environments
  }
}

/**
 * Native scroll & keyboard-avoidance container powered by `@expo/ui`:
 * - iOS: SwiftUI `ScrollView` + `scrollPosition` + `scrollTargetLayout` + `scrollDismissesKeyboard`
 * - Android: Jetpack Compose `ScrollView` + `imePadding()`
 * - Web: Universal `ScrollView` + `scrollIntoView` smooth anchor scrolling
 */
export const KeyboardLayoutAdapter = forwardRef<
  KeyboardScrollHandle,
  KeyboardLayoutAdapterProps
>(function KeyboardLayoutAdapter(
  {
    children,
    scrollConfig,
    formStyle,
    formGap = 16,
    formAlignment = 'start',
    formModifiers = [],
    testID,
  },
  ref
) {
  const scrollTargetState = useNativeState<string | null>(null);

  const scrollToField = useCallback(
    (fieldPath: string) => {
      const anchorId = getFieldScrollAnchorId(fieldPath);
      scrollTargetState.set(anchorId);

      if (typeof document !== 'undefined') {
        const el =
          document.querySelector(`[data-testid="${anchorId}"]`) ??
          document.getElementById(anchorId);
        if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
          (el as HTMLElement).scrollIntoView({
            behavior: scrollConfig?.smoothScroll !== false ? 'smooth' : 'auto',
            block: 'center',
          });
        }
      }
    },
    [scrollTargetState, scrollConfig?.smoothScroll]
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToField,
    }),
    [scrollToField]
  );

  const scrollEnabled = scrollConfig?.enabled !== false;
  const direction: 'vertical' | 'horizontal' =
    scrollConfig?.direction === 'horizontal' ? 'horizontal' : 'vertical';
  const showsIndicator = scrollConfig?.showsIndicators !== false;
  const bottomInset = scrollConfig?.bottomContentInset ?? 28;
  const keyboardAware = scrollConfig?.keyboardAware !== false;
  const dismissOnDrag = scrollConfig?.dismissKeyboardOnDrag !== false;

  const { scrollModifiers, contentModifiers } = getPlatformScrollContainerModifiers(
    dismissOnDrag,
    scrollTargetState,
    keyboardAware
  );

  const paddedStyle: UniversalStyle = {
    width: '100%',
    ...formStyle,
    paddingBottom:
      (typeof formStyle?.paddingBottom === 'number'
        ? formStyle.paddingBottom
        : typeof formStyle?.padding === 'number'
          ? formStyle.padding
          : 16) + bottomInset,
  };

  const content = (
    <Column
      spacing={formGap}
      alignment={formAlignment}
      style={paddedStyle}
      modifiers={[...contentModifiers, ...formModifiers]}
      testID={testID ?? 'expo-form-content'}
    >
      {children}
    </Column>
  );

  if (!scrollEnabled) {
    return content;
  }

  return (
    <ScrollView
      direction={direction}
      showsIndicators={showsIndicator}
      modifiers={scrollModifiers}
      testID={testID ? `${testID}-scroll` : 'expo-form-scroll'}
    >
      {content}
    </ScrollView>
  );
});
