import { createContext, useContext, type ReactNode } from 'react';

import type { FieldConfig } from '../types';

export interface FieldListRenderOptions {
  pathPrefix?: string;
  insideFieldGroup?: boolean;
}

export type FieldListRenderFn = (
  fields: readonly FieldConfig[],
  options?: FieldListRenderOptions
) => ReactNode;

export const FieldRenderDelegateContext = createContext<FieldListRenderFn | null>(null);

export function useRenderFieldList(): FieldListRenderFn {
  const fn = useContext(FieldRenderDelegateContext);
  if (!fn) {
    throw new Error('useRenderFieldList must be called inside <FormRenderer />');
  }
  return fn;
}
