import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useMemo,
  useRef,
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
  type AnchorLayoutRect,
  type PlatformScrollAnchorHandle,
} from '../core/nativePlatformBridge';
import type { ScrollToFieldOptions } from '../state/FormStore';
import type {
  FieldRendererProps,
  FieldType,
  FormKeyboardConfig,
  FormScrollConfig,
} from '../types';

export type FieldReturnKeyType = NonNullable<FieldRendererProps['returnKeyType']>;

export interface ScrollAnchorRegistryValue {
  registerAnchor: (anchorId: string, handle: PlatformScrollAnchorHandle | null) => void;
  reportAnchorLayout: (anchorId: string, rect: AnchorLayoutRect) => void;
  getAnchorLayout: (anchorId: string) => AnchorLayoutRect | undefined;
}

export const ScrollAnchorRegistryContext = createContext<ScrollAnchorRegistryValue | null>(
  null
);

export function useScrollAnchorRegistry(): ScrollAnchorRegistryValue | null {
  return useContext(ScrollAnchorRegistryContext);
}

export interface KeyboardScrollHandle {
  scrollToField: (fieldPath: string, options?: ScrollToFieldOptions) => void;
  getMeasuredFieldLayout?: (fieldPath: string) => AnchorLayoutRect | undefined;
  getMeasuredContainerLayout?: () => AnchorLayoutRect | undefined;
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

export function buildFieldScrollTargetModifiers(
  fieldPath: string,
  onAnchorMeasured?: (rect: AnchorLayoutRect) => void
): any[] {
  return getPlatformFieldAnchorModifiers(
    getFieldScrollAnchorId(fieldPath),
    onAnchorMeasured
  );
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
  const anchorHandlesRef = useRef<Map<string, PlatformScrollAnchorHandle>>(new Map());
  const anchorLayoutsRef = useRef<Map<string, AnchorLayoutRect>>(new Map());
  const containerLayoutRef = useRef<AnchorLayoutRect | undefined>(undefined);

  const registerAnchor = useCallback(
    (anchorId: string, handle: PlatformScrollAnchorHandle | null) => {
      if (handle) {
        anchorHandlesRef.current.set(anchorId, handle);
      } else {
        anchorHandlesRef.current.delete(anchorId);
      }
    },
    []
  );

  const reportAnchorLayout = useCallback((anchorId: string, rect: AnchorLayoutRect) => {
    anchorLayoutsRef.current.set(anchorId, rect);
  }, []);

  const getAnchorLayout = useCallback(
    (anchorId: string) => anchorLayoutsRef.current.get(anchorId),
    []
  );

  const handleContainerMeasured = useCallback((rect: AnchorLayoutRect) => {
    containerLayoutRef.current = rect;
  }, []);

  const scrollRegistryValue = useMemo<ScrollAnchorRegistryValue>(
    () => ({
      registerAnchor,
      reportAnchorLayout,
      getAnchorLayout,
    }),
    [registerAnchor, reportAnchorLayout, getAnchorLayout]
  );

  const scrollToField = useCallback(
    (fieldPath: string, options?: ScrollToFieldOptions) => {
      const anchorId = getFieldScrollAnchorId(fieldPath);

      // Reset first if re-targeting the same anchor so SwiftUI `scrollPosition` observes a transition
      if (scrollTargetState.get() === anchorId) {
        scrollTargetState.set(null);
      }
      scrollTargetState.set(anchorId);

      // Android Jetpack Compose: invoke registered Compose BringIntoView anchor when field's own
      // focus handle is not already about to be focused (covers non-text fields & focusFirstError=false)
      if (!options?.willFocusField) {
        const androidAnchor = anchorHandlesRef.current.get(anchorId);
        if (androidAnchor) {
          void androidAnchor.bringIntoView();
        }
      }

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
      getMeasuredFieldLayout: (fieldPath: string) =>
        anchorLayoutsRef.current.get(getFieldScrollAnchorId(fieldPath)),
      getMeasuredContainerLayout: () => containerLayoutRef.current,
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
    keyboardAware,
    handleContainerMeasured
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
    <ScrollAnchorRegistryContext.Provider value={scrollRegistryValue}>
      <Column
        spacing={formGap}
        alignment={formAlignment}
        style={paddedStyle}
        modifiers={[...contentModifiers, ...formModifiers]}
        testID={testID ?? 'expo-form-content'}
      >
        {children}
      </Column>
    </ScrollAnchorRegistryContext.Provider>
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
