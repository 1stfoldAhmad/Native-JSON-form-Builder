import { useEffect, useRef } from 'react';
import { useNativeState, type ObservableState } from '@expo/ui';

import { applyMask, stripMask } from '../utils/masking';
import type { FormStore } from './FormStore';

export interface UseNativeTextStateOptions {
  store: FormStore;
  fieldPath: string;
  mask?: string;
  unmaskValue?: boolean;
  transformInput?: (text: string) => string;
  parseToStoreValue?: (displayString: string) => unknown;
  formatFromStoreValue?: (storeVal: unknown) => string;
}

/**
 * Bridges `@expo/ui`'s `useNativeState<string>` with `FormStore` without causing
 * JS-thread keystroke round-trips or cursor flickering on iOS/Android:
 *
 * - Typing updates the native SwiftUI / Jetpack Compose view synchronously on the UI thread
 *   and informs `FormStore.setValueFromUserInput(...)` without echoing back `nativeState.set(...)`
 *   unless an explicit mask/transform alters the typed characters.
 * - Programmatic updates (`formRef.current.setValue`, `reset`, draft restore, computed values)
 *   increment `externalValueVersion`, triggering `nativeState.set(nextDisplayString)` cleanly.
 */
export function useNativeTextState({
  store,
  fieldPath,
  mask,
  unmaskValue = false,
  transformInput,
  parseToStoreValue,
  formatFromStoreValue,
}: UseNativeTextStateOptions): {
  nativeState: ObservableState<string>;
  handleChangeText: (rawText: string) => void;
} {
  const formatVal = (val: unknown): string => {
    if (formatFromStoreValue) return formatFromStoreValue(val);
    if (val === null || val === undefined) return '';
    const str = String(val);
    return mask ? applyMask(str, mask) : str;
  };

  const initialDisplay = formatVal(store.getValue(fieldPath));
  const nativeState = useNativeState<string>(initialDisplay);
  const externalVersion = store.getExternalVersion(fieldPath);
  const lastSyncedExternalRef = useRef<number>(externalVersion);

  useEffect(() => {
    if (lastSyncedExternalRef.current !== externalVersion) {
      lastSyncedExternalRef.current = externalVersion;
      const nextDisplay = formatVal(store.getValue(fieldPath));
      if (nativeState.get() !== nextDisplay) {
        nativeState.set(nextDisplay);
      }
    }
  });

  const handleChangeText = (incomingText: string) => {
    let display = transformInput ? transformInput(incomingText) : incomingText;
    if (mask) {
      display = applyMask(display, mask);
    }

    // Only write back to nativeState during typing if masking/transform modified the string
    if (display !== incomingText && nativeState.get() !== display) {
      nativeState.set(display);
    }

    let valueForStore: unknown = display;
    if (parseToStoreValue) {
      valueForStore = parseToStoreValue(display);
    } else if (mask && unmaskValue) {
      valueForStore = stripMask(display, mask);
    }

    store.setValueFromUserInput(fieldPath, valueForStore);
  };

  return {
    nativeState,
    handleChangeText,
  };
}
