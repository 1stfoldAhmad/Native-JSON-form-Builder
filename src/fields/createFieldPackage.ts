import { createElement, type ComponentType } from 'react';

import type {
  FieldRegistrationEntry,
  FieldRendererProps,
  FormValues,
  PlatformCapabilityName,
} from '../types';

export type CustomFieldValidatorFn<TValue = unknown> = (
  value: TValue,
  values: FormValues
) => string | null | undefined;

export interface FieldPackageDefinition<TValue = unknown, TProps = Record<string, unknown>> {
  /** Unique JSON field type name (e.g., `'ibanAccount'`, `'biometricApproval'`). */
  type: string;
  /** Semantic category for diagnostics & theming. */
  category?: FieldRegistrationEntry['category'];
  /** `@expo/ui`-backed React component receiving `FieldRendererProps` + typed `customProps`. */
  component: ComponentType<FieldRendererProps<TValue> & { customProps?: TProps }>;
  /** Default synchronous validator automatically registered when this package is installed. */
  defaultValidator?: CustomFieldValidatorFn<TValue>;
  /** Optional serializer transforming runtime store value into submission payload value. */
  serialize?: (value: TValue) => unknown;
  /** Optional deserializer transforming initial/draft value into runtime store value. */
  deserialize?: (raw: unknown) => TValue;
  /** Whether this custom field holds sensitive secret values. */
  isSensitive?: boolean;
  /** Hardware capabilities required or optionally leveraged by this custom field. */
  capabilities?: {
    required?: PlatformCapabilityName[];
    optional?: PlatformCapabilityName[];
  };
  /** Custom JSON Schema keywords under `field.props` for documentation & tooling. */
  propsSchema?: Record<string, unknown>;
}

/**
 * Ergonomic developer API for authoring reusable, typed custom field packages
 * that plug cleanly into `PluginRegistry` or `FieldRegistry`.
 */
export function createFieldPackage<
  TValue = unknown,
  TProps = Record<string, unknown>,
>(
  definition: FieldPackageDefinition<TValue, TProps>
): FieldPackageDefinition<TValue, TProps> & {
  toFieldRegistrationEntry: () => FieldRegistrationEntry;
} {
  if (!definition.type || typeof definition.type !== 'string') {
    throw new Error('createFieldPackage requires a non-empty `type` string.');
  }

  const WrappedComponent: ComponentType<FieldRendererProps<any>> = (props) => {
    const Inner = definition.component;
    return createElement(Inner, {
      ...props,
      customProps: props.field.props as TProps | undefined,
    });
  };
  WrappedComponent.displayName = `FieldPackage(${definition.type})`;

  return {
    ...definition,
    toFieldRegistrationEntry: () => ({
      type: definition.type,
      category: definition.category ?? 'custom',
      isSensitive: definition.isSensitive ?? false,
      component: WrappedComponent,
    }),
  };
}
