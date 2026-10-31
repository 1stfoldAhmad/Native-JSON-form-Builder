import type {
  BuiltInFieldType,
  FieldComponent,
  FieldRegistrationEntry,
} from '../types';
import { AddressLocationFieldRenderer } from './AddressLocationFields';
import { BarcodeScannerFieldRenderer } from './BarcodeScannerField';
import { DateTimeFieldRenderer } from './DateTimeFields';
import { FileUploadFieldRenderer } from './FileUploadFields';
import { NumericFieldRenderer } from './NumericFields';
import { SelectionFieldRenderer } from './SelectionFields';
import { StructuralFieldRenderer } from './StructuralFields';
import { TextPersonalFieldRenderer } from './TextPersonalFields';

/**
 * Complete list of all 88 built-in field types from Section 2 (Categories A–G).
 */
export const ALL_BUILT_IN_FIELD_TYPES: readonly BuiltInFieldType[] = [
  // Category A — Text and personal information (20)
  'text',
  'firstName',
  'middleName',
  'lastName',
  'fullName',
  'username',
  'email',
  'phone',
  'emailOrPhone',
  'password',
  'confirmPassword',
  'pin',
  'otp',
  'textarea',
  'search',
  'masked',
  'organization',
  'jobTitle',
  'website',
  'url',

  // Category B — Numeric and financial fields (11)
  'number',
  'integer',
  'decimal',
  'currency',
  'percentage',
  'age',
  'quantity',
  'price',
  'phoneExtension',
  'slider',
  'rangeSlider',

  // Category C — Selection and choice fields (14)
  'checkbox',
  'checkboxGroup',
  'switch',
  'radioGroup',
  'select',
  'searchableSelect',
  'multiSelect',
  'searchableMultiSelect',
  'autocomplete',
  'chips',
  'tagInput',
  'segmentedControl',
  'rating',
  'colorPicker',

  // Category D — Date and time fields (9)
  'date',
  'time',
  'dateTime',
  'dateRange',
  'birthday',
  'month',
  'year',
  'duration',
  'timezone',

  // Category E — Address and location fields (9)
  'address',
  'addressLine1',
  'addressLine2',
  'country',
  'state',
  'city',
  'postalCode',
  'coordinates',
  'locationSearch',

  // Category F — File and media upload fields (11)
  'image',
  'camera',
  'avatar',
  'video',
  'audio',
  'document',
  'pdf',
  'file',
  'multipleFiles',
  'multipleImages',
  'signature',

  // Category G — Structural and advanced fields (14)
  'heading',
  'description',
  'staticText',
  'divider',
  'section',
  'fieldGroup',
  'hidden',
  'readOnly',
  'computed',
  'repeater',
  'objectGroup',
  'arrayGroup',
  'conditionalGroup',
  'stepGroup',
] as const;

/**
 * Extensible FieldRegistry mapping field `type` strings to native `@expo/ui` renderers.
 * Developers can register new custom field types at runtime without modifying the core renderer.
 */
export class FieldRegistry {
  private entries = new Map<string, FieldRegistrationEntry>();

  public register(entry: FieldRegistrationEntry): this {
    this.entries.set(entry.type, entry);
    return this;
  }

  public registerField(
    type: string,
    component: FieldComponent,
    options?: Omit<FieldRegistrationEntry, 'type' | 'component'>
  ): this {
    return this.register({
      type,
      component,
      category: options?.category ?? 'custom',
      isStructural: options?.isStructural ?? false,
      isSensitive: options?.isSensitive ?? false,
      defaultEmptyValue: options?.defaultEmptyValue,
    });
  }

  public unregister(type: string): boolean {
    return this.entries.delete(type);
  }

  public get(type: string): FieldRegistrationEntry | undefined {
    return this.entries.get(type);
  }

  public has(type: string): boolean {
    return this.entries.has(type);
  }

  public getTypes(): string[] {
    return Array.from(this.entries.keys());
  }

  public clone(): FieldRegistry {
    const copy = new FieldRegistry();
    for (const [k, v] of this.entries.entries()) {
      copy.entries.set(k, { ...v });
    }
    return copy;
  }
}

export function createDefaultFieldRegistry(): FieldRegistry {
  const registry = new FieldRegistry();

  // Category A: Text & Personal Info (20)
  const categoryATypes: BuiltInFieldType[] = [
    'text',
    'firstName',
    'middleName',
    'lastName',
    'fullName',
    'username',
    'email',
    'phone',
    'emailOrPhone',
    'password',
    'confirmPassword',
    'pin',
    'otp',
    'textarea',
    'search',
    'masked',
    'organization',
    'jobTitle',
    'website',
    'url',
  ];
  for (const t of categoryATypes) {
    registry.register({
      type: t,
      component: TextPersonalFieldRenderer,
      category: 'text',
      isSensitive:
        t === 'password' || t === 'confirmPassword' || t === 'pin' || t === 'otp',
      defaultEmptyValue: '',
    });
  }

  // Category B: Numeric & Financial (11)
  const categoryBTypes: BuiltInFieldType[] = [
    'number',
    'integer',
    'decimal',
    'currency',
    'percentage',
    'age',
    'quantity',
    'price',
    'phoneExtension',
    'slider',
    'rangeSlider',
  ];
  for (const t of categoryBTypes) {
    registry.register({
      type: t,
      component: NumericFieldRenderer,
      category: 'numeric',
      defaultEmptyValue: t === 'rangeSlider' ? [0, 100] : undefined,
    });
  }

  // Category C: Selection & Choice (14)
  const categoryCTypes: BuiltInFieldType[] = [
    'checkbox',
    'checkboxGroup',
    'switch',
    'radioGroup',
    'select',
    'searchableSelect',
    'multiSelect',
    'searchableMultiSelect',
    'autocomplete',
    'chips',
    'tagInput',
    'segmentedControl',
    'rating',
    'colorPicker',
  ];
  for (const t of categoryCTypes) {
    registry.register({
      type: t,
      component: SelectionFieldRenderer,
      category: 'selection',
    });
  }

  // Category D: Date & Time (9)
  const categoryDTypes: BuiltInFieldType[] = [
    'date',
    'time',
    'dateTime',
    'dateRange',
    'birthday',
    'month',
    'year',
    'duration',
    'timezone',
  ];
  for (const t of categoryDTypes) {
    registry.register({
      type: t,
      component: DateTimeFieldRenderer,
      category: 'datetime',
    });
  }

  // Category E: Address & Location (9)
  const categoryETypes: BuiltInFieldType[] = [
    'address',
    'addressLine1',
    'addressLine2',
    'country',
    'state',
    'city',
    'postalCode',
    'coordinates',
    'locationSearch',
  ];
  for (const t of categoryETypes) {
    registry.register({
      type: t,
      component: AddressLocationFieldRenderer,
      category: 'location',
    });
  }

  // Category F: File & Media Uploads (11)
  const categoryFTypes: BuiltInFieldType[] = [
    'image',
    'camera',
    'avatar',
    'video',
    'audio',
    'document',
    'pdf',
    'file',
    'multipleFiles',
    'multipleImages',
    'signature',
  ];
  for (const t of categoryFTypes) {
    registry.register({
      type: t,
      component: FileUploadFieldRenderer,
      category: 'upload',
    });
  }

  // Category G: Structural & Advanced (14)
  const selfWrappedStructural = new Set<BuiltInFieldType>([
    'heading',
    'description',
    'staticText',
    'divider',
    'section',
    'fieldGroup',
    'hidden',
    'repeater',
    'objectGroup',
    'conditionalGroup',
    'stepGroup',
  ]);

  const categoryGTypes: BuiltInFieldType[] = [
    'heading',
    'description',
    'staticText',
    'divider',
    'section',
    'fieldGroup',
    'hidden',
    'readOnly',
    'computed',
    'repeater',
    'objectGroup',
    'arrayGroup',
    'conditionalGroup',
    'stepGroup',
  ];
  for (const t of categoryGTypes) {
    registry.register({
      type: t,
      component: StructuralFieldRenderer,
      category: 'structural',
      isStructural: selfWrappedStructural.has(t),
    });
  }

  // Built-in aliases (keeping ALL_BUILT_IN_FIELD_TYPES at the canonical 88 base types)
  registry.register({
    type: 'calculated',
    component: StructuralFieldRenderer,
    category: 'structural',
    isStructural: false,
  });
  registry.register({
    type: 'newPassword',
    component: TextPersonalFieldRenderer,
    category: 'text',
  });
  registry.register({
    type: 'cvv',
    component: NumericFieldRenderer,
    category: 'numeric',
  });
  registry.register({
    type: 'barcode',
    component: BarcodeScannerFieldRenderer,
    category: 'text',
  });
  registry.register({
    type: 'qrCode',
    component: BarcodeScannerFieldRenderer,
    category: 'text',
  });
  registry.register({
    type: 'documentScan',
    component: FileUploadFieldRenderer,
    category: 'upload',
  });

  return registry;
}

/**
 * Built-in alias field types registered alongside `ALL_BUILT_IN_FIELD_TYPES`.
 */
export const BUILT_IN_FIELD_TYPE_ALIASES: readonly string[] = [
  'calculated',
  'newPassword',
  'cvv',
  'barcode',
  'qrCode',
  'documentScan',
];

/**
 * Default singleton FieldRegistry pre-populated with all 88 built-in native renderers.
 */
export const defaultFieldRegistry = createDefaultFieldRegistry();

/**
 * Convenience helper to register a custom field renderer globally.
 */
export function registerField(
  type: string,
  component: FieldComponent,
  options?: Omit<FieldRegistrationEntry, 'type' | 'component'>
): void {
  defaultFieldRegistry.registerField(type, component, options);
}
