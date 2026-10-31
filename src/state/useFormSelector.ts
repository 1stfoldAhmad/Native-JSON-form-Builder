import { useCallback, useRef, useSyncExternalStore } from 'react';

import { deepEqual } from '../utils/deepPath';
import type { FormStore } from './FormStore';

/**
 * Fine-grained React 19 `useSyncExternalStore` selector that only triggers a re-render
 * when one of `watchedPaths` notifies AND the selected slice actually changes.
 */
export function useFormSelector<TSlice>(
  store: FormStore,
  watchedPaths: readonly string[],
  selector: (store: FormStore) => TSlice,
  isEqual: (a: TSlice, b: TSlice) => boolean = deepEqual
): TSlice {
  const pathsKey = watchedPaths.join('\u0000');
  const cacheRef = useRef<{ version: number; value: TSlice } | null>(null);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const paths = pathsKey ? pathsKey.split('\u0000') : [];
      return store.subscribePaths(paths, onStoreChange);
    },
    [store, pathsKey]
  );

  const getSnapshot = useCallback((): TSlice => {
    const version = store.getVersion();
    if (cacheRef.current && cacheRef.current.version === version) {
      return cacheRef.current.value;
    }
    const nextValue = selector(store);
    if (cacheRef.current && isEqual(cacheRef.current.value, nextValue)) {
      cacheRef.current = { version, value: cacheRef.current.value };
      return cacheRef.current.value;
    }
    cacheRef.current = { version, value: nextValue };
    return nextValue;
  }, [store, selector, isEqual]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
