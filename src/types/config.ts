import type { FormAnimationsConfig } from './animations';
import type { FieldConfig, FormStepConfig } from './fields';
import type { FormStyleConfig, FormThemeConfig } from './styles';
import type { ConditionExpression, FormValidationBehaviorConfig, JsonSchemaDefinition } from './validation';

/**
 * Form section configuration (Section 7 & Section 14).
 */
export interface FormSectionConfig {
  id: string;
  title?: string | Record<string, string>;
  description?: string | Record<string, string>;
  footer?: string | Record<string, string>;
  /** Render using `@expo/ui` native FieldGroup.Section settings-card style or standard Column section. */
  variant?: 'default' | 'card' | 'fieldGroup' | (string & {});
  /** Allow collapsing/expanding section using `@expo/ui` Collapsible. */
  collapsible?: boolean;
  /** Initial expanded state when `collapsible` is true. Defaults to true. */
  defaultExpanded?: boolean;
  /** Fields inside this section (or field names referencing `config.fields`). */
  fields: readonly (FieldConfig | string)[];
  visibleWhen?: ConditionExpression;
  hiddenWhen?: ConditionExpression;
}

/**
 * Responsive layout & grid configuration (Section 7 & Section 14).
 */
export interface FormLayoutConfig {
  /** Primary stacking direction. Defaults to 'vertical'. */
  direction?: 'vertical' | 'horizontal' | (string & {});
  /** Number of columns on compact/mobile viewports. Defaults to 1. */
  columns?: number;
  /** Number of columns on tablet/wide viewports (>= tabletBreakpoint). */
  tabletColumns?: number;
  /** Viewport width breakpoint in dp/px for tablet layout. Defaults to 768. */
  tabletBreakpoint?: number;
  /** Vertical gap between fields/rows. */
  rowGap?: number;
  /** Horizontal gap between side-by-side fields. */
  columnGap?: number;
  /** Label placement strategy. */
  labelPosition?: 'top' | 'inline' | 'hidden' | (string & {});
  /** Explicit row groupings of field names (e.g. [['firstName', 'lastName'], ['email']]). */
  rows?: readonly (readonly string[])[];
}

/**
 * Native scroll configuration (Section 5).
 */
export interface FormScrollConfig {
  /** Wrap form content in `@expo/ui` ScrollView. Defaults to true. */
  enabled?: boolean;
  /** Scroll direction. Defaults to 'vertical'. */
  direction?: 'vertical' | 'horizontal' | (string & {});
  /** Automatically apply native keyboard padding (`imePadding` on Android, keyboard safe area on iOS). Defaults to true. */
  keyboardAware?: boolean;
  /** Smoothly scroll focused or invalid field into view. Defaults to true. */
  scrollToFocusedField?: boolean;
  /** Dismiss keyboard on scroll drag (`scrollDismissesKeyboard` on iOS). Defaults to true. */
  dismissKeyboardOnDrag?: boolean;
  /** Extra bottom inset in dp/pt so the submit button never sits behind the keyboard or home indicator. Defaults to 24. */
  bottomContentInset?: number;
  /** Smooth scrolling behavior. Defaults to true. */
  smoothScroll?: boolean;
  /** Show native scroll indicators. Defaults to true. */
  showsIndicators?: boolean;
  /**
   * Threshold of top-level items above which the renderer uses `@expo/ui` `List` + `List.ForEach`
   * virtualized native rendering instead of eager `ScrollView` children (Section 5 performance note).
   * Set `true` to always virtualize, `false` to disable, or a field-count threshold (e.g. 40).
   */
  lazyRendering?: boolean | number;
}

/**
 * Native keyboard navigation & return-key behavior (Section 5).
 */
export interface FormKeyboardConfig {
  /** Automatically advance focus to the next editable field on Return/Next. Defaults to true. */
  autoAdvanceFocus?: boolean;
  /** Submit the form when Return/Submit is pressed on the final field. Defaults to true. */
  submitOnLastField?: boolean;
  /** Default return key type for intermediate fields. Defaults to 'next'. */
  defaultReturnKeyType?: 'next' | 'done' | 'default' | (string & {});
  /** Return key type on the final editable field. Defaults to 'done'. */
  lastFieldReturnKeyType?: 'done' | 'go' | 'send' | 'search' | (string & {});
  /** Dismiss keyboard automatically when submit button is pressed. Defaults to true. */
  dismissOnSubmit?: boolean;
}

/**
 * Submit & secondary action button configuration (Section 7 & Section 14).
 */
export interface FormSubmitConfig {
  /** Submit button label (localized string or map). Defaults to 'Submit'. */
  label?: string | Record<string, string>;
  /** Label shown while submission is in progress. Defaults to 'Submitting...'. */
  loadingLabel?: string | Record<string, string>;
  /** Label shown briefly on submission success. */
  successLabel?: string | Record<string, string>;
  /** Hide the built-in submit button (useful when driving submission imperatively via `formRef`). */
  hidden?: boolean;
  /** Disable submit button until form is dirty. */
  disableUntilDirty?: boolean;
  /** Disable submit button while invalid. */
  disableWhenInvalid?: boolean;
  /** Prevent duplicate submissions while loading. Defaults to true. */
  preventDuplicateSubmit?: boolean;
  /** Render a secondary Reset button beside/below Submit. */
  showReset?: boolean;
  /** Reset button label. Defaults to 'Reset'. */
  resetLabel?: string | Record<string, string>;
  /** Registered action ID in `actions` to invoke on submit in addition to `onSubmit` prop. */
  actionId?: string;
  /** Button visual variant. */
  variant?: 'filled' | 'outlined' | 'text' | (string & {});
}

/**
 * Form-level accessibility defaults (Section 12).
 */
export interface FormAccessibilityConfig {
  /** Announce validation errors via screen reader (`AccessibilityInfo.announceForAccessibility`). Defaults to true. */
  announceValidationErrors?: boolean;
  /** Append required-field hint for screen readers. Defaults to true. */
  announceRequiredFields?: boolean;
  /** Enforce minimum interactive touch target height (44pt/48dp). Defaults to 44. */
  minTouchTargetSize?: number;
  /** Required field indicator symbol. Defaults to '*'. */
  requiredIndicatorText?: string;
}

/**
 * Internationalization & RTL configuration (Section 12).
 */
export interface FormI18nConfig {
  /** Active BCP-47 locale tag (e.g. 'en', 'en-US', 'ur', 'ur-PK', 'ar'). */
  locale?: string;
  /** Explicit layout direction ('ltr' | 'rtl' | 'auto'). 'auto' infers RTL for locales like 'ur', 'ar', 'fa', 'he'. */
  direction?: 'ltr' | 'rtl' | 'auto' | (string & {});
  /** Default IANA timezone (e.g. 'Asia/Karachi'). */
  timezone?: string;
  /** Default ISO 4217 currency code (e.g. 'PKR', 'USD'). */
  currency?: string;
  /** Localized string dictionary keyed by locale -> key -> translation. */
  translations?: Record<string, Record<string, string>>;
}

/**
 * Optional draft persistence & restoration configuration (Section 14).
 */
export interface FormDraftConfig {
  enabled?: boolean;
  /** Storage key override (defaults to `expo-form-draft:${config.id}`). */
  storageKey?: string;
  /** Alias for `storageKey`. */
  key?: string;
  /** Debounce interval (ms) before saving draft changes. Defaults to 500. */
  debounceMs?: number;
  /** Exclude sensitive fields (passwords, PINs, OTPs) from persisted drafts. Defaults to true (enforced). */
  excludeSensitive?: boolean;
  /** Clear saved draft automatically after successful submission. Defaults to true. */
  clearOnSubmit?: boolean;
}

/**
 * Security defaults (Section 12).
 */
export interface FormSecurityConfig {
  /** Never include password/sensitive values in debug logs or persisted drafts. Defaults to true. */
  protectSensitiveFields?: boolean;
  /** Clear password/PIN/OTP fields whenever form resets. Defaults to true. */
  clearSensitiveOnReset?: boolean;
  /** Additional field names treated as sensitive alongside password/confirmPassword/pin/otp. */
  sensitiveFields?: readonly string[];
}

/**
 * Registered action descriptor inside JSON config (Section 7).
 */
export interface FormActionReference {
  /** Registered handler ID in ExpoFormProvider / ExpoForm props. */
  handlerId: string;
  /** Optional static metadata passed to the action handler. */
  params?: Record<string, unknown>;
}

/**
 * Complete single-file JSON Form Configuration Contract (Section 7).
 */
export interface FormConfig {
  /** Optional JSON Schema URI for IDE validation & autocomplete (e.g. "native-json-form-builder/schema/expo-form.schema.json"). */
  $schema?: string;
  /** Unique form identifier. */
  id: string;
  /** Configuration schema version (e.g. '1.0' or '1.0.0'). */
  version?: string;
  /** Form heading title. */
  title?: string | Record<string, string>;
  /** Supporting form description. */
  description?: string | Record<string, string>;

  /** Layer-1 JSON Schema 2020-12 validation contract. */
  schema?: JsonSchemaDefinition;

  /** Ordered field definitions. */
  fields?: readonly FieldConfig[];

  /** Optional section groupings organizing fields. */
  sections?: readonly FormSectionConfig[];

  /** Optional top-level multi-step wizard steps. */
  steps?: readonly FormStepConfig[];

  /** Form structure & responsive grid layout. */
  layout?: FormLayoutConfig;

  /** Complete JSON styling tokens. */
  style?: FormStyleConfig;

  /** Light/dark appearance and theme seed color. */
  theme?: FormThemeConfig;

  /** Native animation triggers and presets. */
  animations?: FormAnimationsConfig;

  /** Native ScrollView and keyboard inset configuration. */
  scroll?: FormScrollConfig;

  /** Keyboard return-key and focus chain configuration. */
  keyboard?: FormKeyboardConfig;

  /** Validation timing, error display, and cross-field rules. */
  validation?: FormValidationBehaviorConfig;

  /** Initial default values keyed by field path. */
  defaults?: Record<string, unknown>;

  /** Named references to registered action handlers. */
  actions?: Record<string, string | FormActionReference>;

  /** Submission button & behavior configuration. */
  submit?: FormSubmitConfig;

  /** Accessibility defaults. */
  accessibility?: FormAccessibilityConfig;

  /** Internationalization, locale, timezone, and RTL configuration. */
  i18n?: FormI18nConfig;

  /** Draft persistence & restoration configuration. */
  draft?: FormDraftConfig;
  /** Alias for `draft`. */
  persistence?: FormDraftConfig;

  /** Security & sensitive-field handling configuration. */
  security?: FormSecurityConfig;

  /** Global disabled or read-only flags. */
  disabled?: boolean;
  readOnly?: boolean;
}

/**
 * Zero-runtime-cost helper providing strict autocomplete when authoring configs in `.ts` files.
 */
export function defineFormConfig<T extends FormConfig>(config: T): T {
  return config;
}
