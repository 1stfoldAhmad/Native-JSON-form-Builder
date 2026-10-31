import { useMemo, type ReactNode } from 'react';

import type { PluginRegistry } from '../plugins/PluginRegistry';
import type {
  ActionHandler,
  AsyncFieldValidator,
  ComputedCalculator,
  DataSourceProvider,
  DraftStorageAdapter,
  FieldComponent,
  FormThemeConfig,
  IconRenderOverride,
} from '../types';
import { BUILT_IN_DATA_SOURCES } from '../utils/countries';
import { isRTLLocale } from '../utils/formatting';
import { ExpoFormGlobalConfigContext, useExpoFormGlobalConfig } from './context';
import { HostBoundary } from './HostBoundary';

export interface ExpoFormProviderProps {
  children: ReactNode;
  /** Optional shared Host creation for multiple forms/Expo UI layouts in the same screen. */
  createHost?: boolean;
  /** Shared theme configuration inherited by descendant forms. */
  theme?: FormThemeConfig;
  /** Shared locale (e.g. 'en', 'ur'). */
  locale?: string;
  /** Shared color scheme override ('light' | 'dark'). */
  colorScheme?: 'light' | 'dark';
  /** Registered dynamic/remote option data sources. */
  dataSources?: Record<string, DataSourceProvider>;
  /** Registered asynchronous server validators. */
  asyncValidators?: Record<string, AsyncFieldValidator>;
  /** Registered named action handlers. */
  actions?: Record<string, ActionHandler>;
  /** Registered pure calculators for computed fields. */
  calculators?: Record<string, ComputedCalculator>;
  /** Registered custom field components. */
  customFields?: Record<string, FieldComponent>;
  /** Optional global icon renderer override. */
  renderIcon?: IconRenderOverride;
  /** Optional global draft storage adapter. */
  storageAdapter?: DraftStorageAdapter;
  /** Optional isolated PluginRegistry providing custom fields, validators, formulas, themes, and middleware. */
  pluginRegistry?: PluginRegistry;
  /** Optional grouped global configuration object (alternative to passing individual props). */
  config?: Omit<ExpoFormProviderProps, 'children' | 'config'>;
}

/**
 * Shared provider for registering data sources, async validators, custom fields,
 * theme defaults, i18n, draft storage, and optional shared `@expo/ui` Host management.
 */
export function ExpoFormProvider({
  children,
  createHost,
  theme,
  locale,
  colorScheme,
  dataSources,
  asyncValidators,
  actions,
  calculators,
  customFields,
  renderIcon,
  storageAdapter,
  pluginRegistry,
  config,
}: ExpoFormProviderProps) {
  const parent = useExpoFormGlobalConfig();
  const effectiveCreateHost = createHost ?? config?.createHost ?? false;
  const effectivePluginRegistry =
    pluginRegistry ?? config?.pluginRegistry ?? parent.pluginRegistry;

  const pluginCustomFields = useMemo(() => {
    if (!effectivePluginRegistry) return undefined;
    const out: Record<string, FieldComponent> = {};
    for (const typeName of effectivePluginRegistry.fields.getTypes()) {
      const def = effectivePluginRegistry.fields.get(typeName);
      if (def) out[typeName] = def.component;
    }
    return out;
  }, [effectivePluginRegistry]);

  const mergedValue = useMemo(
    () => ({
      theme: theme ?? config?.theme ?? parent.theme,
      locale: locale ?? config?.locale ?? parent.locale,
      colorScheme: colorScheme ?? config?.colorScheme ?? parent.colorScheme,
      dataSources: {
        ...BUILT_IN_DATA_SOURCES,
        ...effectivePluginRegistry?.getDataSourcesObject(),
        ...parent.dataSources,
        ...config?.dataSources,
        ...dataSources,
      },
      asyncValidators: {
        ...effectivePluginRegistry?.getAsyncValidatorsObject(),
        ...parent.asyncValidators,
        ...config?.asyncValidators,
        ...asyncValidators,
      },
      actions: {
        ...effectivePluginRegistry?.getWorkflowActionsObject(),
        ...parent.actions,
        ...config?.actions,
        ...actions,
      },
      calculators: {
        ...effectivePluginRegistry?.getCalculatorsObject(),
        ...parent.calculators,
        ...config?.calculators,
        ...calculators,
      },
      customFields: {
        ...pluginCustomFields,
        ...parent.customFields,
        ...config?.customFields,
        ...customFields,
      },
      renderIcon: renderIcon ?? config?.renderIcon ?? parent.renderIcon,
      storageAdapter: storageAdapter ?? config?.storageAdapter ?? parent.storageAdapter,
      pluginRegistry: effectivePluginRegistry,
    }),
    [
      theme,
      locale,
      colorScheme,
      dataSources,
      asyncValidators,
      actions,
      calculators,
      customFields,
      renderIcon,
      storageAdapter,
      effectivePluginRegistry,
      pluginCustomFields,
      config,
      parent,
    ]
  );

  const content = (
    <ExpoFormGlobalConfigContext.Provider value={mergedValue}>
      {children}
    </ExpoFormGlobalConfigContext.Provider>
  );

  if (effectiveCreateHost) {
    const isRTL = isRTLLocale(mergedValue.locale);
    return (
      <HostBoundary
        hostMode="auto"
        colorScheme={mergedValue.colorScheme}
        seedColor={mergedValue.theme?.seedColor}
        isRTL={isRTL}
        matchContents={false}
        useViewportSizeMeasurement>
        {content}
      </HostBoundary>
    );
  }

  return content;
}
