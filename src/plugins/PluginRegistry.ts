import { ConditionRegistry, type CustomConditionOperatorFn } from '../conditions/ConditionRegistry';
import type { AuthHeaderProvider } from '../datasources/DataSourceManager';
import type {
  CustomFieldValidatorFn,
  FieldPackageDefinition,
} from '../fields/createFieldPackage';
import { createDefaultFieldRegistry, FieldRegistry } from '../fields/FieldRegistry';
import { FormulaFunctionRegistry, type PureFormulaFunction } from '../formula/functions';
import type { RemoteDraftTransport } from '../persistence/RemoteDraftSyncAdapter';
import { ThemeRegistry, type RegisteredFormTheme } from '../styles/ThemeRegistry';
import type {
  ActionHandler,
  AsyncFieldValidator,
  ComputedCalculator,
  DataSourceProvider,
  FieldRegistrationEntry,
} from '../types';
import {
  MiddlewarePipeline,
  type FormLifecycleHookName,
  type MiddlewareHandler,
} from './MiddlewarePipeline';

export interface FormPlugin {
  /** Globally unique plugin identifier (e.g., `'@acme/banking-fields'`). */
  id: string;
  version?: string;
  description?: string;
  fields?: Array<FieldRegistrationEntry | FieldPackageDefinition<any, any>>;
  validators?: Record<string, CustomFieldValidatorFn<any>>;
  asyncValidators?: Record<string, AsyncFieldValidator>;
  formulaFunctions?: Record<string, PureFormulaFunction>;
  calculators?: Record<string, ComputedCalculator>;
  conditionOperators?: Record<string, CustomConditionOperatorFn>;
  dataSources?: Record<string, DataSourceProvider>;
  authProviders?: Record<string, AuthHeaderProvider>;
  workflowActions?: Record<string, ActionHandler>;
  themes?: RegisteredFormTheme[];
  remoteDraftTransport?: RemoteDraftTransport;
  middleware?: Partial<{
    [K in FormLifecycleHookName]: MiddlewareHandler<K>;
  }>;
}

export interface PluginRegistryOptions {
  /** Reject duplicate extension keys across plugins instead of overwriting. Defaults to `true`. */
  strictCollisions?: boolean;
  isolateMiddlewareErrors?: boolean;
  onMiddlewareError?: (hook: FormLifecycleHookName, error: unknown) => void;
}

/**
 * Isolated per-instance developer extension platform (`PluginRegistry`) managing:
 * - custom `@expo/ui` fields & `createFieldPackage` bundles
 * - sync & async validators
 * - formula functions & calculators
 * - custom condition operators
 * - data source providers & REST auth providers
 * - workflow actions, themes, remote draft transports, and lifecycle middleware.
 */
export class PluginRegistry {
  readonly fields: FieldRegistry;
  readonly formulaFunctions: FormulaFunctionRegistry;
  readonly conditions: ConditionRegistry;
  readonly themes: ThemeRegistry;
  readonly middleware: MiddlewarePipeline;

  private readonly strictCollisions: boolean;
  private readonly installedPlugins = new Map<string, FormPlugin>();
  private readonly syncValidators = new Map<string, CustomFieldValidatorFn<any>>();
  private readonly asyncValidators = new Map<string, AsyncFieldValidator>();
  private readonly calculators = new Map<string, ComputedCalculator>();
  private readonly dataSources = new Map<string, DataSourceProvider>();
  private readonly authProviders = new Map<string, AuthHeaderProvider>();
  private readonly workflowActions = new Map<string, ActionHandler>();
  private remoteDraftTransport?: RemoteDraftTransport;
  private readonly cleanupCallbacks = new Map<string, Array<() => void>>();

  constructor(options?: PluginRegistryOptions) {
    this.strictCollisions = options?.strictCollisions ?? true;
    this.fields = createDefaultFieldRegistry();
    this.formulaFunctions = new FormulaFunctionRegistry(true);
    this.conditions = new ConditionRegistry();
    this.themes = new ThemeRegistry(true);
    this.middleware = new MiddlewarePipeline({
      isolateErrors: options?.isolateMiddlewareErrors ?? true,
      onMiddlewareError: options?.onMiddlewareError,
    });
  }

  register(plugin: FormPlugin): () => void {
    if (!plugin.id || typeof plugin.id !== 'string') {
      throw new Error('PluginRegistry.register requires a non-empty `plugin.id`.');
    }
    if (this.installedPlugins.has(plugin.id) && this.strictCollisions) {
      throw new Error(`Plugin "${plugin.id}" is already registered.`);
    }

    const cleanups: Array<() => void> = [];

    for (const entry of plugin.fields ?? []) {
      const maybePkg = entry as {
        toFieldRegistrationEntry?: () => FieldRegistrationEntry;
      };
      const def: FieldRegistrationEntry =
        typeof maybePkg.toFieldRegistrationEntry === 'function'
          ? maybePkg.toFieldRegistrationEntry()
          : (entry as FieldRegistrationEntry);
      if (this.strictCollisions && this.fields.has(def.type)) {
        throw new Error(
          `Plugin "${plugin.id}" collided on already-registered field type "${def.type}".`
        );
      }
      this.fields.register(def);
      cleanups.push(() => this.fields.unregister(def.type));
      if ('defaultValidator' in entry && entry.defaultValidator) {
        const validatorKey = `field:${def.type}`;
        this.syncValidators.set(validatorKey, entry.defaultValidator);
        cleanups.push(() => this.syncValidators.delete(validatorKey));
      }
    }

    for (const [key, fn] of Object.entries(plugin.validators ?? {})) {
      this.assertAvailable(this.syncValidators, key, 'validator', plugin.id);
      this.syncValidators.set(key, fn);
      cleanups.push(() => this.syncValidators.delete(key));
    }

    for (const [key, fn] of Object.entries(plugin.asyncValidators ?? {})) {
      this.assertAvailable(this.asyncValidators, key, 'asyncValidator', plugin.id);
      this.asyncValidators.set(key, fn);
      cleanups.push(() => this.asyncValidators.delete(key));
    }

    for (const [name, fn] of Object.entries(plugin.formulaFunctions ?? {})) {
      const normalized = name.toUpperCase();
      if (this.strictCollisions && this.formulaFunctions.has(normalized)) {
        throw new Error(
          `Plugin "${plugin.id}" collided on formula function "${normalized}".`
        );
      }
      this.formulaFunctions.register(normalized, fn);
    }

    for (const [key, fn] of Object.entries(plugin.calculators ?? {})) {
      this.assertAvailable(this.calculators, key, 'calculator', plugin.id);
      this.calculators.set(key, fn);
      cleanups.push(() => this.calculators.delete(key));
    }

    for (const [opName, fn] of Object.entries(plugin.conditionOperators ?? {})) {
      if (this.strictCollisions && this.conditions.getOperator(opName)) {
        throw new Error(
          `Plugin "${plugin.id}" collided on condition operator "${opName}".`
        );
      }
      this.conditions.registerOperator(opName, fn);
    }

    for (const [id, loader] of Object.entries(plugin.dataSources ?? {})) {
      this.assertAvailable(this.dataSources, id, 'dataSource', plugin.id);
      this.dataSources.set(id, loader);
      cleanups.push(() => this.dataSources.delete(id));
    }

    for (const [id, auth] of Object.entries(plugin.authProviders ?? {})) {
      this.assertAvailable(this.authProviders, id, 'authProvider', plugin.id);
      this.authProviders.set(id, auth);
      cleanups.push(() => this.authProviders.delete(id));
    }

    for (const [id, handler] of Object.entries(plugin.workflowActions ?? {})) {
      this.assertAvailable(this.workflowActions, id, 'workflowAction', plugin.id);
      this.workflowActions.set(id, handler);
      cleanups.push(() => this.workflowActions.delete(id));
    }

    for (const theme of plugin.themes ?? []) {
      if (this.strictCollisions && this.themes.has(theme.id)) {
        throw new Error(`Plugin "${plugin.id}" collided on theme "${theme.id}".`);
      }
      cleanups.push(this.themes.register(theme));
    }

    if (plugin.remoteDraftTransport) {
      this.remoteDraftTransport = plugin.remoteDraftTransport;
      cleanups.push(() => {
        if (this.remoteDraftTransport === plugin.remoteDraftTransport) {
          this.remoteDraftTransport = undefined;
        }
      });
    }

    if (plugin.middleware) {
      for (const [hookName, fn] of Object.entries(plugin.middleware)) {
        if (fn) {
          const off = this.middleware.use(
            hookName as FormLifecycleHookName,
            fn as MiddlewareHandler<any>,
            `${plugin.id}:${hookName}`
          );
          cleanups.push(off);
        }
      }
    }

    this.installedPlugins.set(plugin.id, plugin);
    this.cleanupCallbacks.set(plugin.id, cleanups);

    return () => this.unregister(plugin.id);
  }

  unregister(pluginId: string): boolean {
    if (!this.installedPlugins.has(pluginId)) return false;
    const cleanups = this.cleanupCallbacks.get(pluginId) ?? [];
    for (const fn of cleanups) {
      fn();
    }
    this.cleanupCallbacks.delete(pluginId);
    this.installedPlugins.delete(pluginId);
    return true;
  }

  listPlugins(): string[] {
    return Array.from(this.installedPlugins.keys());
  }

  getValidatorsObject(): Record<string, CustomFieldValidatorFn<any>> {
    return Object.fromEntries(this.syncValidators.entries());
  }

  getAsyncValidatorsObject(): Record<string, AsyncFieldValidator> {
    return Object.fromEntries(this.asyncValidators.entries());
  }

  getCalculatorsObject(): Record<string, ComputedCalculator> {
    return Object.fromEntries(this.calculators.entries());
  }

  getDataSourcesObject(): Record<string, DataSourceProvider> {
    return Object.fromEntries(this.dataSources.entries());
  }

  getAuthProvidersObject(): Record<string, AuthHeaderProvider> {
    return Object.fromEntries(this.authProviders.entries());
  }

  getWorkflowActionsObject(): Record<string, ActionHandler> {
    return Object.fromEntries(this.workflowActions.entries());
  }

  getRemoteDraftTransport(): RemoteDraftTransport | undefined {
    return this.remoteDraftTransport;
  }

  private assertAvailable(
    map: Map<string, unknown>,
    key: string,
    kind: string,
    pluginId: string
  ): void {
    if (this.strictCollisions && map.has(key)) {
      throw new Error(
        `Plugin "${pluginId}" collided on already-registered ${kind} "${key}".`
      );
    }
  }
}
