import type {
  FieldConfig,
  FormAnimationsConfig,
  FormConfig,
  FormDraftConfig,
  FormI18nConfig,
  FormKeyboardConfig,
  FormLayoutConfig,
  FormScrollConfig,
  FormSectionConfig,
  FormSecurityConfig,
  FormStepConfig,
  FormStyleConfig,
  FormSubmitConfig,
  FormThemeConfig,
  FormValidationBehaviorConfig,
  JsonSchemaDefinition,
} from '../types';
import { deepClone } from '../utils/deepPath';
import { parseAndValidateFormConfig, type ParsedFormConfigResult } from './configParser';

/**
 * Canonical `$schema` path consumers can place at the top of any custom `form.json`
 * for IDE autocomplete, hover documentation, and standard validation.
 */
export const EXPO_FORM_SCHEMA_URI =
  'native-json-form-builder/schema/expo-form.schema.json';

/**
 * Fluent, immutable-output builder for programmatically generating standard-compliant
 * `form.json` configurations (`FormConfig`).
 */
export class FormConfigBuilder {
  private draftConfig: FormConfig;

  constructor(id: string) {
    this.draftConfig = {
      $schema: EXPO_FORM_SCHEMA_URI,
      id,
      version: '1.0.0',
    };
  }

  public schemaUri(uri: string): this {
    this.draftConfig = { ...this.draftConfig, $schema: uri };
    return this;
  }

  public version(version: string): this {
    this.draftConfig = { ...this.draftConfig, version };
    return this;
  }

  public title(title: string | Record<string, string>): this {
    this.draftConfig = { ...this.draftConfig, title };
    return this;
  }

  public description(description: string | Record<string, string>): this {
    this.draftConfig = { ...this.draftConfig, description };
    return this;
  }

  public defaults(defaults: Record<string, unknown>): this {
    this.draftConfig = {
      ...this.draftConfig,
      defaults: { ...(this.draftConfig.defaults ?? {}), ...defaults },
    };
    return this;
  }

  public addField(field: FieldConfig): this {
    const nextFields = [...(this.draftConfig.fields ?? []), field];
    this.draftConfig = { ...this.draftConfig, fields: nextFields };
    return this;
  }

  public addFields(fields: readonly FieldConfig[]): this {
    const nextFields = [...(this.draftConfig.fields ?? []), ...fields];
    this.draftConfig = { ...this.draftConfig, fields: nextFields };
    return this;
  }

  public addSection(section: FormSectionConfig): this {
    const nextSections = [...(this.draftConfig.sections ?? []), section];
    this.draftConfig = { ...this.draftConfig, sections: nextSections };
    return this;
  }

  public addStep(step: FormStepConfig): this {
    const nextSteps = [...(this.draftConfig.steps ?? []), step];
    this.draftConfig = { ...this.draftConfig, steps: nextSteps };
    return this;
  }

  public jsonSchema(schema: JsonSchemaDefinition): this {
    this.draftConfig = { ...this.draftConfig, schema };
    return this;
  }

  public layout(layout: FormLayoutConfig): this {
    this.draftConfig = { ...this.draftConfig, layout };
    return this;
  }

  public style(style: FormStyleConfig): this {
    this.draftConfig = { ...this.draftConfig, style };
    return this;
  }

  public theme(theme: FormThemeConfig): this {
    this.draftConfig = { ...this.draftConfig, theme };
    return this;
  }

  public animations(animations: FormAnimationsConfig): this {
    this.draftConfig = { ...this.draftConfig, animations };
    return this;
  }

  public scroll(scroll: FormScrollConfig): this {
    this.draftConfig = { ...this.draftConfig, scroll };
    return this;
  }

  public keyboard(keyboard: FormKeyboardConfig): this {
    this.draftConfig = { ...this.draftConfig, keyboard };
    return this;
  }

  public validation(validation: FormValidationBehaviorConfig): this {
    this.draftConfig = { ...this.draftConfig, validation };
    return this;
  }

  public submit(submit: FormSubmitConfig): this {
    this.draftConfig = { ...this.draftConfig, submit };
    return this;
  }

  public i18n(i18n: FormI18nConfig): this {
    this.draftConfig = { ...this.draftConfig, i18n };
    return this;
  }

  public draft(draft: FormDraftConfig): this {
    this.draftConfig = { ...this.draftConfig, draft };
    return this;
  }

  public security(security: FormSecurityConfig): this {
    this.draftConfig = { ...this.draftConfig, security };
    return this;
  }

  /** Validate the current builder configuration against the ExpoForm standard. */
  public validate(): ParsedFormConfigResult {
    return parseAndValidateFormConfig(this.draftConfig);
  }

  /** Build and return a validated deep clone of the `FormConfig`. Throws if fatal standard errors exist. */
  public build(): FormConfig {
    const res = this.validate();
    if (!res.valid || !res.config) {
      const summary = res.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new Error(`Invalid FormConfig (${this.draftConfig.id}): ${summary}`);
    }
    return deepClone(res.config);
  }

  /** Alias for `build()` supporting `JSON.stringify(builder)`. */
  public toJSON(): FormConfig {
    return this.build();
  }

  /** Serialize the validated form configuration as a formatted `form.json` string. */
  public toJsonString(space = 2): string {
    return serializeFormConfig(this.build(), { space });
  }
}

/**
 * Create a fluent `FormConfigBuilder` to generate a standard-compliant `form.json`.
 */
export function createFormBuilder(id: string): FormConfigBuilder {
  return new FormConfigBuilder(id);
}

/**
 * Serialize any valid `FormConfig` object into a standard `form.json` string (including `$schema`).
 */
export function serializeFormConfig(
  config: FormConfig,
  options?: { space?: number; includeSchema?: boolean }
): string {
  const space = options?.space ?? 2;
  const includeSchema = options?.includeSchema ?? true;
  const normalized: FormConfig = includeSchema
    ? {
        $schema: config.$schema ?? EXPO_FORM_SCHEMA_URI,
        ...config,
      }
    : config;
  return JSON.stringify(normalized, null, space);
}

export type StarterTemplateKind = 'blank' | 'contact' | 'login' | 'wizard';

/**
 * Ready-to-edit starter templates adhering to the official ExpoForm `form.json` standard.
 */
export function createStarterFormTemplate(
  kind: StarterTemplateKind = 'blank',
  idOverride?: string
): FormConfig {
  switch (kind) {
    case 'login':
      return createFormBuilder(idOverride ?? 'custom-login-form')
        .title({ en: 'Sign In', ur: 'سائن ان کریں' })
        .description('Custom authentication form adhering to the ExpoForm standard.')
        .addFields([
          {
            name: 'email',
            type: 'email',
            label: { en: 'Email Address', ur: 'ای میل ایڈریس' },
            placeholder: 'you@example.com',
            required: true,
          },
          {
            name: 'password',
            type: 'password',
            label: { en: 'Password', ur: 'پاس ورڈ' },
            placeholder: 'Enter password',
            required: true,
            visibilityToggle: true,
            validation: { minLength: 8 },
          },
          {
            name: 'rememberMe',
            type: 'checkbox',
            label: 'Keep me signed in on this device',
            defaultValue: true,
          },
        ])
        .submit({ label: 'Sign In', showReset: false })
        .build();

    case 'contact':
      return createFormBuilder(idOverride ?? 'custom-contact-form')
        .title({ en: 'Contact Us', ur: 'ہم سے رابطہ کریں' })
        .description('Send us a message and our team will respond promptly.')
        .defaults({ country: 'PK', priority: 'normal' })
        .addSection({
          id: 'sender',
          title: 'Your Information',
          variant: 'card',
          collapsible: true,
          defaultExpanded: true,
          fields: [
            {
              name: 'fullName',
              type: 'fullName',
              label: 'Full Name',
              placeholder: 'Ahmad Khan',
              required: true,
            },
            {
              name: 'email',
              type: 'email',
              label: 'Work Email',
              placeholder: 'ahmad@company.com',
              required: true,
            },
            {
              name: 'country',
              type: 'country',
              label: 'Country',
            },
            {
              name: 'phone',
              type: 'phone',
              label: 'Mobile Number',
              countryField: 'country',
            },
          ],
        })
        .addSection({
          id: 'inquiry',
          title: 'Message Details',
          variant: 'card',
          collapsible: true,
          defaultExpanded: true,
          fields: [
            {
              name: 'priority',
              type: 'segmentedControl',
              label: 'Urgency',
              options: [
                { label: 'Low', value: 'low' },
                { label: 'Normal', value: 'normal' },
                { label: 'Urgent', value: 'urgent' },
              ],
            },
            {
              name: 'message',
              type: 'textarea',
              label: 'How can we help?',
              placeholder: 'Describe your project or question...',
              required: true,
              numberOfLines: 4,
              validation: { minLength: 10 },
            },
          ],
        })
        .submit({ label: 'Send Message', showReset: true })
        .build();

    case 'wizard':
      return createFormBuilder(idOverride ?? 'custom-onboarding-wizard')
        .title('Workspace Setup Wizard')
        .description('Multi-step wizard generated from declarative JSON.')
        .addStep({
          id: 'step-profile',
          title: 'Profile',
          description: 'Tell us who you are',
          validateBeforeNext: true,
          fields: [
            {
              name: 'firstName',
              type: 'firstName',
              label: 'First Name',
              required: true,
            },
            {
              name: 'lastName',
              type: 'lastName',
              label: 'Last Name',
              required: true,
            },
            {
              name: 'role',
              type: 'select',
              label: 'Primary Role',
              required: true,
              options: [
                { label: 'Engineering', value: 'engineering' },
                { label: 'Product', value: 'product' },
                { label: 'Design', value: 'design' },
              ],
            },
          ],
        })
        .addStep({
          id: 'step-preferences',
          title: 'Preferences',
          description: 'Configure your workspace',
          fields: [
            {
              name: 'teamSize',
              type: 'slider',
              label: 'Team Size',
              min: 1,
              max: 100,
              step: 1,
              defaultValue: 10,
            },
            {
              name: 'enableNotifications',
              type: 'switch',
              label: 'Enable push & email notifications',
              defaultValue: true,
            },
          ],
        })
        .submit({ label: 'Complete Setup', showReset: true })
        .build();

    case 'blank':
    default:
      return createFormBuilder(idOverride ?? 'my-custom-form')
        .title({ en: 'My Custom Form', ur: 'میرا کسٹم فارم' })
        .description('Edit this JSON following the ExpoForm standard to generate any native form.')
        .addFields([
          {
            name: 'fullName',
            type: 'fullName',
            label: { en: 'Full Name', ur: 'پورا نام' },
            placeholder: 'Enter your name',
            required: true,
            validation: { minLength: 2 },
          },
          {
            name: 'email',
            type: 'email',
            label: { en: 'Email Address', ur: 'ای میل' },
            placeholder: 'name@domain.com',
            required: true,
          },
          {
            name: 'accountPlan',
            type: 'segmentedControl',
            label: 'Plan Tier',
            defaultValue: 'starter',
            options: [
              { label: 'Starter', value: 'starter' },
              { label: 'Pro', value: 'pro' },
              { label: 'Enterprise', value: 'enterprise' },
            ],
          },
          {
            name: 'companyName',
            type: 'organization',
            label: 'Company Name',
            placeholder: 'Acme Corp',
            visibleWhen: { field: 'accountPlan', equals: 'enterprise' },
            requiredWhen: { field: 'accountPlan', equals: 'enterprise' },
          },
        ])
        .submit({ label: 'Submit Form', showReset: true })
        .build();
  }
}
