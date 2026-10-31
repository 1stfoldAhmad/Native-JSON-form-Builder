import { createContext, useContext } from 'react';

import type { PluginRegistry } from '../plugins/PluginRegistry';
import type { FormStore } from '../state/FormStore';
import type {
  ActionHandler,
  AsyncFieldValidator,
  ComputedCalculator,
  DataSourceProvider,
  DraftStorageAdapter,
  FieldComponent,
  FormConfig,
  FormThemeConfig,
  IconRenderOverride,
} from '../types';

export interface ManagedHostContextValue {
  hasManagedHost: boolean;
}

/**
 * Tracks whether the current component tree is already inside an ExpoForm-managed
 * `@expo/ui` `<Host>` native tree (and resets to `false` across `ManagedRNHostView` boundaries).
 */
export const ManagedHostContext = createContext<ManagedHostContextValue>({
  hasManagedHost: false,
});

export function useHasManagedHost(): boolean {
  return useContext(ManagedHostContext).hasManagedHost;
}

export interface ExpoFormGlobalConfigContextValue {
  theme?: FormThemeConfig;
  locale?: string;
  colorScheme?: 'light' | 'dark';
  dataSources: Record<string, DataSourceProvider>;
  asyncValidators: Record<string, AsyncFieldValidator>;
  actions: Record<string, ActionHandler>;
  calculators: Record<string, ComputedCalculator>;
  customFields: Record<string, FieldComponent>;
  renderIcon?: IconRenderOverride;
  storageAdapter?: DraftStorageAdapter;
  pluginRegistry?: PluginRegistry;
}

export const ExpoFormGlobalConfigContext = createContext<ExpoFormGlobalConfigContextValue>({
  dataSources: {},
  asyncValidators: {},
  actions: {},
  calculators: {},
  customFields: {},
});

export function useExpoFormGlobalConfig(): ExpoFormGlobalConfigContextValue {
  return useContext(ExpoFormGlobalConfigContext);
}

export interface ActiveFormContextValue {
  config: FormConfig;
  store: FormStore;
  locale: string;
  isRTL: boolean;
  colorScheme: 'light' | 'dark';
  reducedMotion: boolean;
  dataSources: Record<string, DataSourceProvider>;
  actions: Record<string, ActionHandler>;
  customFields: Record<string, FieldComponent>;
  renderIcon?: IconRenderOverride;
  scrollToField: (fieldPath: string) => void;
}

export const ActiveFormContext = createContext<ActiveFormContextValue | null>(null);

export function useActiveForm(): ActiveFormContextValue {
  const ctx = useContext(ActiveFormContext);
  if (!ctx) {
    throw new Error('useActiveForm must be used within an <ExpoForm /> component tree.');
  }
  return ctx;
}
