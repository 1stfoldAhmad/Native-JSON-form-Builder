import type { ReactElement, ReactNode } from 'react';
import { Host, RNHostView, type RNHostViewProps } from '@expo/ui';

import type { HostMode } from '../types';
import { ManagedHostContext, useHasManagedHost } from './context';

export interface HostBoundaryProps {
  hostMode?: HostMode;
  colorScheme?: 'light' | 'dark';
  seedColor?: string;
  isRTL?: boolean;
  matchContents?: boolean | { vertical?: boolean; horizontal?: boolean };
  useViewportSizeMeasurement?: boolean;
  testID?: string;
  children: ReactNode;
}

/**
 * First-class automatic `@expo/ui` Host boundary manager (Section 6).
 *
 * - `'auto'` (default): Reuses an existing `ExpoForm`-managed `<Host>` when nested inside
 *   `<HostBoundary>` or another `<ExpoForm />` layout via `ManagedHostContext`; automatically
 *   mounts a `<Host>` when placed inside a standard React Native `View` or standalone screen.
 *   Note: `@expo/ui`'s raw `<Host>` does not expose a public React context, so when embedding
 *   `<ExpoForm />` directly inside an external manually mounted `@expo/ui` `<Host>`, pass
 *   `hostMode="inherit"` to avoid nesting a second `<Host>`.
 * - `'inherit'`: Assumes an ancestor already mounted an external `@expo/ui` `<Host>`.
 * - `'always'`: Forces a dedicated `<Host>` (safely bridged via `RNHostView` if already inside a managed Host).
 */
export function HostBoundary({
  hostMode = 'auto',
  colorScheme,
  seedColor,
  isRTL = false,
  matchContents = { vertical: true },
  useViewportSizeMeasurement = false,
  testID,
  children,
}: HostBoundaryProps) {
  const insideManagedHost = useHasManagedHost();

  if (hostMode === 'inherit' || (hostMode === 'auto' && insideManagedHost)) {
    return (
      <ManagedHostContext.Provider value={{ hasManagedHost: true }}>
        {children}
      </ManagedHostContext.Provider>
    );
  }

  const hostNode = (
    <Host
      colorScheme={colorScheme}
      seedColor={seedColor}
      layoutDirection={isRTL ? 'rightToLeft' : 'leftToRight'}
      matchContents={matchContents}
      useViewportSizeMeasurement={useViewportSizeMeasurement}
      testID={testID}
      style={!matchContents ? { flex: 1, width: '100%' } : { width: '100%' }}>
      <ManagedHostContext.Provider value={{ hasManagedHost: true }}>
        {children}
      </ManagedHostContext.Provider>
    </Host>
  );

  // If `hostMode === 'always'` is requested while already inside a managed SwiftUI/Compose Host,
  // bridge back to RN via RNHostView first so `@expo/ui` never nests a Host directly inside native content.
  if (insideManagedHost) {
    return (
      <RNHostView matchContents={{ vertical: true }}>
        {hostNode}
      </RNHostView>
    );
  }

  return hostNode;
}

/**
 * Safe wrapper around `@expo/ui`'s `RNHostView` that resets `ManagedHostContext` to `false`
 * for any React Native subtree rendered inside an Expo UI Host (e.g. `@expo/ui/community/*`
 * drop-in components that create their own internal Host).
 */
export function ManagedRNHostView({
  children,
  ...rest
}: Omit<RNHostViewProps, 'children'> & { children: ReactElement }) {
  const insideHost = useHasManagedHost();
  const content = (
    <ManagedHostContext.Provider value={{ hasManagedHost: false }}>
      {children}
    </ManagedHostContext.Provider>
  );

  if (!insideHost) {
    return content;
  }

  return <RNHostView {...rest}>{content}</RNHostView>;
}
