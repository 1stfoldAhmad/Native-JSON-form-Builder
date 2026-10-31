# Native JSON Form Builder (`native-json-form-builder`)

A schema-driven **Native JSON Form Builder & Renderer** for React Native and **Expo SDK 58+**, powered by **`@expo/ui`** (SwiftUI on iOS, Jetpack Compose on Android, universal Web support) and **AJV JSON Schema 2020-12**.

Author a declarative `form.json` file following the official **ExpoForm Standard** (`schema/expo-form.schema.json`), pass it to `<ExpoForm />`, and get a complete, keyboard-aware, accessible native form—covering **88 built-in field types**, password visibility toggles, live strength meters, input masks, dependent searchable pickers, media & document uploads, conditional visibility/requirement rules, computed fields, repeaters, multi-step wizards, and RTL localization.

---

## Table of Contents

1. [Installation & Expo Setup](#1-installation--expo-setup)
2. [Quick Start (3 Ways to Generate a Form)](#2-quick-start-3-ways-to-generate-a-form)
3. [Official `form.json` Standard Specification](#3-official-formjson-standard-specification)
4. [All 88 Built-In Field Types & JSON Examples](#4-all-88-built-in-field-types--json-examples)
5. [Validation Standard (JSON Schema 2020-12 + Layer-2 Rules)](#5-validation-standard-json-schema-2020-12--layer-2-rules)
6. [Conditional Logic & Computed Fields](#6-conditional-logic--computed-fields)
7. [Sections & Multi-Step Wizards](#7-sections--multi-step-wizards)
8. [Theming, Styling, Animations & RTL Localization](#8-theming-styling-animations--rtl-localization)
9. [Validating & Generating `form.json` Programmatically](#9-validating--generating-formjson-programmatically)
10. [Component, Provider & Imperative `ref` API Reference](#10-component-provider--imperative-ref-api-reference)
11. [Plugin & Extension Architecture](#11-plugin--extension-architecture)
12. [Security & Privacy Guarantees](#12-security--privacy-guarantees)
13. [Included Example App & Ready-Made Schemas](#13-included-example-app--ready-made-schemas)
14. [Enterprise Engine, Workflows, Native Capabilities & Tooling (Levels 1–4)](#14-enterprise-engine-workflows-native-capabilities--tooling-levels-14)

---

## 1. Installation & Expo Setup

### Install the Package & Peer Dependencies

```bash
npx expo install native-json-form-builder @expo/ui ajv ajv-formats
```

If your forms use **camera/photo uploads** (`image`, `camera`, `avatar`, `video`, `multipleImages`) or **file/PDF pickers** (`document`, `pdf`, `audio`, `file`, `multipleFiles`), install the optional Expo picker packages:

```bash
npx expo install expo-image-picker expo-document-picker
```

### Configure Expo Plugins in `app.json` (Optional, for Media & Document Uploads)

```json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow $(PRODUCT_NAME) to select photos for form uploads.",
          "cameraPermission": "Allow $(PRODUCT_NAME) to capture photos with the camera."
        }
      ],
      "expo-document-picker"
    ]
  }
}
```

### Running in Expo Go, Expo Web, or Development Builds

- **Expo Go & Expo Web (SDK 58+)**: `@expo/ui` is included in **Expo Go** starting in Expo SDK 58, so you can run and preview native SwiftUI (iOS) and Jetpack Compose (Android) forms immediately with `npx expo start`, as well as in the browser with `npx expo start --web`.
- **Development Builds (`npx expo run:ios` / `npx expo run:android` / EAS Build)**: Use a development build when preparing production App Store / Google Play builds, adding third-party native modules not bundled with Expo Go, or applying custom native `app.json` config plugin settings (such as custom camera/photo permission strings).

---

## 2. Quick Start (3 Ways to Generate a Form)

### Option A — Write Your Own `form.json` File (Recommended)

Create a `my-form.json` file following our standard (include `$schema` for instant VS Code / IDE autocomplete and validation):

```json
{
  "$schema": "native-json-form-builder/schema/expo-form.schema.json",
  "id": "customer-signup",
  "version": "1.0.0",
  "title": "Create Account",
  "description": "Start your 14-day free workspace trial.",
  "defaults": {
    "plan": "pro",
    "country": "PK"
  },
  "fields": [
    {
      "name": "fullName",
      "type": "fullName",
      "label": "Full Name",
      "placeholder": "Ahmad Khan",
      "required": true,
      "validation": { "minLength": 2 }
    },
    {
      "name": "email",
      "type": "email",
      "label": "Work Email",
      "placeholder": "ahmad@company.com",
      "required": true
    },
    {
      "name": "country",
      "type": "country",
      "label": "Country",
      "required": true
    },
    {
      "name": "phone",
      "type": "phone",
      "label": "Mobile Phone",
      "countryField": "country",
      "required": true
    },
    {
      "name": "plan",
      "type": "segmentedControl",
      "label": "Plan Tier",
      "options": [
        { "label": "Starter", "value": "starter" },
        { "label": "Pro", "value": "pro" },
        { "label": "Enterprise", "value": "enterprise" }
      ]
    },
    {
      "name": "organization",
      "type": "organization",
      "label": "Company Name",
      "visibleWhen": { "field": "plan", "equals": "enterprise" },
      "requiredWhen": { "field": "plan", "equals": "enterprise" }
    },
    {
      "name": "password",
      "type": "password",
      "label": "Password",
      "required": true,
      "visibilityToggle": true,
      "showStrengthIndicator": true,
      "validation": {
        "password": {
          "minLength": 8,
          "requireUppercase": true,
          "requireLowercase": true,
          "requireNumber": true,
          "requireSpecialChar": true
        }
      }
    },
    {
      "name": "confirmPassword",
      "type": "confirmPassword",
      "label": "Confirm Password",
      "passwordField": "password",
      "required": true,
      "validation": { "equalsField": "password" }
    }
  ],
  "submit": {
    "label": "Create Workspace",
    "showReset": true
  }
}
```

Render it with `<ExpoForm />`:

```tsx
import React from 'react';
import { ExpoForm, type FormConfig } from 'native-json-form-builder';
import myForm from './my-form.json';

export default function SignupScreen() {
  return (
    <ExpoForm
      config={myForm as FormConfig}
      onSubmit={async (values, helpers) => {
        console.log('Validated submission:', values);
      }}
    />
  );
}
```

### Option B — Pass a Raw JSON String Directly (API / CMS / Live Editor)

`<ExpoForm />` accepts **both** a parsed `FormConfig` object **and** a raw JSON `string`. When given a string, the library parses it, validates it against the ExpoForm standard, and renders the native form automatically:

```tsx
const remoteFormJsonString = await fetch('https://api.example.com/forms/onboarding.json').then((r) =>
  r.text()
);

<ExpoForm
  config={remoteFormJsonString}
  onConfigError={(issues) => console.warn('Standard issues:', issues)}
  onSubmit={handleSubmit}
/>;
```

### Option C — Generate `form.json` Programmatically with `createFormBuilder()`

```tsx
import { createFormBuilder, ExpoForm } from 'native-json-form-builder';

const generatedConfig = createFormBuilder('lead-capture')
  .version('1.0.0')
  .title({ en: 'Request a Demo', ur: 'ڈیمو کی درخواست کریں' })
  .addField({ name: 'name', type: 'fullName', label: 'Your Name', required: true })
  .addField({ name: 'email', type: 'email', label: 'Business Email', required: true })
  .addField({ name: 'teamSize', type: 'slider', label: 'Team Size', min: 1, max: 200, defaultValue: 25 })
  .submit({ label: 'Book Demo', showReset: true })
  .build();

// Export as a formatted standard form.json file if needed:
// const jsonFileContent = createFormBuilder('lead-capture')...toJsonString(2);

<ExpoForm config={generatedConfig} onSubmit={handleSubmit} />;
```

### Important: Embedding Inside an Existing `@expo/ui` `<Host>` (`hostMode="inherit"`)

By default (`hostMode="auto"`), `<ExpoForm />` mounts its own `@expo/ui` `<Host>` when rendered inside standard React Native views (`View`, `SafeAreaView`, screen roots) and automatically reuses any ancestor `ExpoForm`-managed `<Host>` via internal React context.

However, because `@expo/ui`'s raw `<Host>` component does **not** expose a public React context, `<ExpoForm />` cannot automatically detect an **externally created** `<Host>`. Whenever you place `<ExpoForm />` directly inside your own `<Host>` tree (for example inside a custom SwiftUI/Compose screen shell or toolbar layout), pass **`hostMode="inherit"`** to prevent mounting a nested `<Host>`:

```tsx
import { Column, Host, Text } from '@expo/ui';
import { ExpoForm } from 'native-json-form-builder';
import myForm from './my-form.json';

export function NativeScreenWithSharedHost() {
  return (
    <Host style={{ flex: 1 }}>
      <Column spacing={16}>
        <Text>Account Setup</Text>
        <ExpoForm
          hostMode="inherit"
          config={myForm}
          onSubmit={handleSubmit}
        />
      </Column>
    </Host>
  );
}
```

---

## 3. Official `form.json` Standard Specification

Every custom `form.json` must follow these core rules so `native-json-form-builder` can deterministically validate and render it across iOS, Android, and Web:

1. **Pure Declarative JSON**: Never embed JavaScript functions inside `form.json`. Reference custom validators, remote data sources, calculators, or submit actions by string ID and register them in `<ExpoFormProvider />` or `<ExpoForm />` props.
2. **Required Root Identifier**: Every form must have a non-empty string `"id"`.
3. **At Least One Structure Key**: Every form must define at least one non-empty `"fields"`, `"sections"`, or `"steps"` array.
4. **Field `type` + `name`**:
   - Every field object must declare a string `"type"` (one of the **88 built-in field types** or a registered custom field type).
   - Every data-bearing field must declare a unique `"name"` (dot-notation paths follow nested `objectGroup` / `repeater` scopes). Purely structural/display elements (`heading`, `description`, `staticText`, `divider`, `section`, `fieldGroup`, `conditionalGroup`, `stepGroup`) do not require `"name"`.
5. **IDE Schema Support**: Add `"$schema": "native-json-form-builder/schema/expo-form.schema.json"` at the root of any `.json` file for full autocomplete, hover documentation, and red-squiggle schema checks.

### Top-Level `form.json` Properties Reference

| Property | Type | Required | Description |
| --- | --- | --- | --- |
| `$schema` | `string` | No | `"native-json-form-builder/schema/expo-form.schema.json"` for IDE validation. |
| `id` | `string` | **Yes** | Unique identifier for the form (also scopes draft storage keys). |
| `version` | `string` | No | Config version string (e.g. `"1.0.0"`). |
| `title` | `string \| Record<locale, string>` | No | Form heading title. |
| `description` | `string \| Record<locale, string>` | No | Form subtitle/instructions below the title. |
| `defaults` | `Record<string, unknown>` | No | Initial values keyed by field `name` or dot path. |
| `fields` | `FieldConfig[]` | One of `fields` / `sections` / `steps` | Ordered list of field configurations. |
| `sections` | `FormSectionConfig[]` | One of `fields` / `sections` / `steps` | Grouped or collapsible card sections containing inline fields or field name references. |
| `steps` | `FormStepConfig[]` | One of `fields` / `sections` / `steps` | Multi-step wizard steps with step indicator & per-step validation. |
| `schema` | `JsonSchemaDefinition` | No | Standard **JSON Schema 2020-12** object compiled via AJV. |
| `layout` | `FormLayoutConfig` | No | Responsive columns (`columns`, `tabletColumns`, `rowGap`, `columnGap`, `rows`). |
| `style` | `FormStyleConfig` | No | Spacing, border radius, typography, and state color overrides. |
| `theme` | `FormThemeConfig` | No | `{ mode: "light" \| "dark" \| "system", seedColor: "#2563EB", light, dark }`. |
| `animations` | `FormAnimationsConfig` | No | Lifecycle animation presets and OS `respectReducedMotion` flag. |
| `scroll` | `FormScrollConfig` | No | `enabled`, `keyboardAware`, `dismissKeyboardOnDrag`, `bottomContentInset`, `lazyRendering`. |
| `keyboard` | `FormKeyboardConfig` | No | `autoAdvanceFocus`, `submitOnLastField`, `defaultReturnKeyType`, `dismissOnSubmit`. |
| `validation` | `FormValidationBehaviorConfig` | No | `mode` (`"onBlur" \| "onChange" \| "onSubmit"`), `scrollToFirstError`, `crossFieldRules`. |
| `submit` | `FormSubmitConfig` | No | Submit/Reset button labels, loading text, `disableWhenInvalid`, `actionId`, `variant`. |
| `accessibility` | `FormAccessibilityConfig` | No | Screen-reader announcements, minimum touch target size (`44`), required indicator. |
| `i18n` | `FormI18nConfig` | No | `locale`, `direction` (`"auto" \| "ltr" \| "rtl"`), `timezone`, `currency`, `translations`. |
| `draft` | `FormDraftConfig` | No | Auto-save draft persistence settings (`enabled`, `debounceMs`, `excludeSensitive`). |
| `security` | `FormSecurityConfig` | No | `protectSensitiveFields`, `clearSensitiveOnReset`, `sensitiveFields`. |

### Standard Field Object (`FieldConfig`) Properties

| Property | Type | Applies To | Description |
| --- | --- | --- | --- |
| `type` | `BuiltInFieldType \| string` | **All fields** | One of the 88 built-in types or a custom registered renderer key. |
| `name` | `string` | All input fields | Key/path in form state & `onSubmit(values)`. |
| `label` | `string \| Record<string, string>` | All fields | Field label (plain string or `{ en, ur, ... }` map). |
| `placeholder` | `string \| Record<string, string>` | Text / Picker fields | Placeholder hint inside empty control. |
| `helperText` | `string \| Record<string, string>` | All fields | Supporting caption below the field. |
| `defaultValue` | `unknown` | Input fields | Field-level initial value. |
| `required` | `boolean` | Input fields | Marks field required (`*` indicator + validation rule). |
| `disabled` / `readOnly` | `boolean` | Input fields | Disables interaction or makes field non-editable. |
| `sensitive` | `boolean` | Any field | Enables native privacy protection, draft exclusion, and log redaction. |
| `row` | `string` | Any field | Consecutive fields sharing the same `row` ID render side-by-side in one horizontal row. |
| `leadingIcon` / `trailingIcon` | `string` | Text / Picker fields | Logical icon name (`user`, `mail`, `lock`, `phone`, `search`, `calendar`, etc.). |
| `mask` / `unmaskValue` | `string` / `boolean` | Text / `masked` | Pattern using `#` (digit), `A` (letter), `*` (alphanumeric), e.g. `"#####-#######-#"`. |
| `options` | `(FieldOption \| string)[]` | Selection fields | Static choices (`{ label, value, description, group, disabled }`). |
| `dataSource` | `string \| FieldDataSourceConfig` | Selection / Autocomplete | Built-in (`"countries"`, `"states"`, `"cities"`, `"timezones"`) or custom registered provider ID. |
| `min` / `max` / `step` / `precision` | `number` | Numeric / Sliders | Numeric bounds, increment step, and decimal rounding precision. |
| `upload` | `FileUploadConfig` | Upload fields | `maxFileSize`, `allowedMimeTypes`, `allowedExtensions`, `maxFiles`, `sources`. |
| `computed` | `ComputedFieldFormula` | `computed` | Declarative formula (`concat`, `sum`, `subtract`, `multiply`, `divide`, `template`, `ageFromDate`). |
| `fields` / `steps` | `FieldConfig[]` / `FormStepConfig[]` | Containers / Repeaters | Nested fields for `section`, `fieldGroup`, `objectGroup`, `repeater`, `conditionalGroup`, `stepGroup`. |
| `visibleWhen` / `hiddenWhen` | `ConditionExpression` | All fields | Dynamically show or hide field (hidden fields automatically skip validation!). |
| `enabledWhen` / `disabledWhen` | `ConditionExpression` | Input fields | Dynamically enable or disable field based on other values. |
| `requiredWhen` | `ConditionExpression` | Input fields | Dynamically require field when a condition evaluates to true. |
| `validation` | `FieldValidationConfig` | Input fields | Layer-2 validation rules, custom messages, password rules, and `asyncValidator`. |

---

## 4. All 88 Built-In Field Types & JSON Examples

| Category | Count | Built-In `type` Values |
| --- | :---: | --- |
| **A. Text & Personal** | 20 | `text`, `firstName`, `middleName`, `lastName`, `fullName`, `username`, `email`, `phone`, `emailOrPhone`, `password`, `confirmPassword`, `pin`, `otp`, `textarea`, `search`, `masked`, `organization`, `jobTitle`, `website`, `url` |
| **B. Numeric & Financial** | 11 | `number`, `integer`, `decimal`, `currency`, `percentage`, `age`, `quantity`, `price`, `phoneExtension`, `slider`, `rangeSlider` |
| **C. Selection & Choice** | 14 | `checkbox`, `checkboxGroup`, `switch`, `radioGroup`, `select`, `searchableSelect`, `multiSelect`, `searchableMultiSelect`, `autocomplete`, `chips`, `tagInput`, `segmentedControl`, `rating`, `colorPicker` |
| **D. Date & Time** | 9 | `date`, `time`, `dateTime`, `dateRange`, `birthday`, `month`, `year`, `duration`, `timezone` |
| **E. Address & Location** | 9 | `address`, `addressLine1`, `addressLine2`, `country`, `state`, `city`, `postalCode`, `coordinates`, `locationSearch` |
| **F. File & Media Uploads** | 11 | `image`, `camera`, `avatar`, `video`, `audio`, `document`, `pdf`, `file`, `multipleFiles`, `multipleImages`, `signature` |
| **G. Structural & Advanced** | 14 | `heading`, `description`, `staticText`, `divider`, `section`, `fieldGroup`, `hidden`, `readOnly`, `computed`, `repeater`, `objectGroup`, `arrayGroup`, `conditionalGroup`, `stepGroup` |

### Category Examples

#### Masked Input, Password Visibility Toggle & Strength Meter (Category A)

```json
[
  {
    "name": "cnic",
    "type": "masked",
    "label": "National ID (CNIC)",
    "mask": "#####-#######-#",
    "placeholder": "35202-1234567-1",
    "required": true
  },
  {
    "name": "password",
    "type": "password",
    "label": "Account Password",
    "visibilityToggle": {
      "showIcon": "eye",
      "hideIcon": "eye-off",
      "showLabel": "Show password",
      "hideLabel": "Hide password"
    },
    "showStrengthIndicator": true,
    "validation": {
      "password": {
        "minLength": 10,
        "requireUppercase": true,
        "requireLowercase": true,
        "requireNumber": true,
        "requireSpecialChar": true,
        "disallowSpaces": true
      }
    }
  }
]
```

#### Dependent Cascading Dropdowns: Country → State → City (Categories C & E)

```json
[
  {
    "name": "country",
    "type": "country",
    "label": "Country",
    "required": true
  },
  {
    "name": "state",
    "type": "state",
    "label": "Province / State",
    "dataSource": {
      "id": "states",
      "dependsOn": ["country"],
      "resetOnDependencyChange": true
    }
  },
  {
    "name": "city",
    "type": "city",
    "label": "City",
    "dataSource": {
      "id": "cities",
      "dependsOn": ["country", "state"],
      "resetOnDependencyChange": true
    }
  }
]
```

#### File & PDF Upload with MIME and File-Size Enforcement (Category F)

```json
{
  "name": "resumePdf",
  "type": "pdf",
  "label": "Resume / CV (PDF)",
  "required": true,
  "upload": {
    "allowedMimeTypes": ["application/pdf"],
    "allowedExtensions": [".pdf"],
    "maxFileSize": 5242880,
    "maxFiles": 1,
    "buttonLabel": "Choose PDF (Max 5 MB)"
  }
}
```

#### Repeater (Dynamic Add/Remove Array of Objects — Category G)

```json
{
  "name": "workExperience",
  "type": "repeater",
  "label": "Work History",
  "minItems": 0,
  "maxItems": 5,
  "addButtonLabel": "Add Position",
  "removeButtonLabel": "Remove",
  "fields": [
    { "name": "company", "type": "organization", "label": "Company", "required": true },
    { "name": "title", "type": "jobTitle", "label": "Role Title", "required": true },
    { "name": "years", "type": "integer", "label": "Years", "min": 0, "max": 40 }
  ]
}
```

---

## 5. Validation Standard (JSON Schema 2020-12 + Layer-2 Rules)

`ExpoForm` combines two complementary validation layers:

### Layer 1 — Standard JSON Schema 2020-12 (`config.schema`)
Powered by `ajv/dist/2020` + `ajv-formats`. Supports `type`, `required`, `properties`, `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `pattern`, `format`, `enum`, `const`, `items`, `minItems`, `maxItems`, `uniqueItems`, `allOf`, `anyOf`, `oneOf`, `not`, `if` / `then` / `else`, and `dependentRequired`.

### Layer 2 — Practical Field, Cross-Field & Async Rules (`field.validation` & `config.validation`)

```json
{
  "name": "username",
  "type": "username",
  "label": "Username",
  "required": true,
  "validation": {
    "minLength": 3,
    "maxLength": 24,
    "regex": {
      "pattern": "^[a-zA-Z0-9._-]+$",
      "message": "Only letters, numbers, dots, underscores, and hyphens are allowed"
    },
    "asyncValidator": {
      "validatorId": "checkUsernameAvailable",
      "debounceMs": 350
    },
    "messages": {
      "required": "Please choose a username"
    }
  }
}
```

**Built-in cross-field & domain rules**:
- `equalsField` / `notEqualsField` (e.g. `"equalsField": "password"`)
- `greaterThanField` / `lessThanField` (numeric range checks)
- `notBeforeField` / `notAfterField` (ISO date ordering)
- `minAge` / `maxAge` (automatic age calculation on `birthday` / `date`)
- Form-level `validation.crossFieldRules` (`atLeastOneOf`, e.g. require either `email` or `backupPhone`)
- **Hidden fields never block submission**: Any field hidden via `visibleWhen` / `hiddenWhen` (or inside a hidden section/step) is automatically excluded from blocking validation.

---

## 6. Conditional Logic & Computed Fields

### Declarative Conditions (`visibleWhen`, `hiddenWhen`, `enabledWhen`, `disabledWhen`, `requiredWhen`)

Supports `equals`, `notEquals`, `in`, `notIn`, `contains`, `notContains`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`, `matches`, `isEmpty`, `isNotEmpty`, `equalsField`, `notEqualsField`, and compound `and` / `or` / `not` boolean trees:

```json
{
  "name": "enterpriseTaxId",
  "type": "text",
  "label": "Corporate Tax Registration ID",
  "visibleWhen": {
    "and": [
      { "field": "accountType", "equals": "business" },
      { "field": "annualRevenue", "greaterThanOrEqual": 100000 }
    ]
  },
  "requiredWhen": {
    "field": "accountType",
    "equals": "business"
  }
}
```

### Live Computed Fields (`type: "computed"`)

Supported operations: `"concat"`, `"template"`, `"sum"`, `"subtract"`, `"multiply"`, `"divide"`, `"ageFromDate"`, `"count"`, `"conditional"`, and `"custom"` (via registered `calculatorId`):

```json
{
  "name": "orderSubtotal",
  "type": "computed",
  "label": "Order Subtotal",
  "currency": "USD",
  "precision": 2,
  "computed": {
    "operation": "multiply",
    "fields": ["quantity", "unitPrice"],
    "precision": 2
  }
}
```

---

## 7. Sections & Multi-Step Wizards

### Collapsible Card Sections (`config.sections`)

```json
{
  "id": "profile-form",
  "sections": [
    {
      "id": "personal-info",
      "title": "Personal Information",
      "description": "Visible on your workspace profile.",
      "variant": "card",
      "collapsible": true,
      "defaultExpanded": true,
      "fields": [
        { "name": "firstName", "type": "firstName", "label": "First Name", "required": true },
        { "name": "lastName", "type": "lastName", "label": "Last Name", "required": true }
      ]
    }
  ]
}
```

### Multi-Step Wizards (`config.steps`)

Each step validates its own active fields before advancing (`validateBeforeNext: true` by default) and shows the final Submit button on the last visible step:

```json
{
  "id": "onboarding-wizard",
  "steps": [
    {
      "id": "account",
      "title": "1. Account",
      "validateBeforeNext": true,
      "fields": [
        { "name": "email", "type": "email", "label": "Email", "required": true }
      ]
    },
    {
      "id": "confirm",
      "title": "2. Finish",
      "fields": [
        { "name": "acceptTerms", "type": "checkbox", "label": "Accept terms", "required": true }
      ]
    }
  ]
}
```

---

## 8. Theming, Styling, Animations & RTL Localization

```json
{
  "theme": {
    "mode": "system",
    "seedColor": "#2563EB"
  },
  "animations": {
    "enabled": true,
    "respectReducedMotion": true,
    "preventLayoutJumps": true
  },
  "i18n": {
    "locale": "ur",
    "direction": "auto",
    "translations": {
      "en": { "submitBtn": "Create Account" },
      "ur": { "submitBtn": "اکاؤنٹ بنائیں" }
    }
  }
}
```

When `locale` is an RTL language (`ur`, `ar`, `fa`, `he`) and `direction` is `"auto"` (or `"rtl"`), `ExpoForm` automatically mirrors alignment, row direction, labels, icons, and text alignment.

---

## 9. Validating & Generating `form.json` Programmatically

Use `parseFormJson` or `validateFormStandard` in your app, backend, or CI pipeline to verify that any user-written `form.json` complies with the ExpoForm standard before rendering:

```ts
import {
  parseFormJson,
  validateFormStandard,
  createFormBuilder,
  createStarterFormTemplate,
  serializeFormConfig,
} from 'native-json-form-builder';

// 1. Validate a user-supplied JSON string or object against the standard
const check = validateFormStandard(userJsonString, { strictFieldTypes: true });
if (!check.valid) {
  console.error('Standard violations:', check.errors);
  // [{ path: 'config.fields[0].name', message: 'Input field of type "email" requires a non-empty string "name".', severity: 'error' }]
}

// 2. Parse into a typed FormConfig + issues list
const { config, valid, issues } = parseFormJson(userJsonString);

// 3. Generate a starter template ('blank' | 'login' | 'contact' | 'wizard')
const template = createStarterFormTemplate('contact');
const formattedJson = serializeFormConfig(template);
```

---

## 10. Component, Provider & Imperative `ref` API Reference

### `<ExpoForm />` Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `config` | `FormConfig \| string` | **Required** | Declarative `FormConfig` object or raw `form.json` string. |
| `ref` | `Ref<ExpoFormRef<TValues>>` | — | Imperative form controller ref. |
| `hostMode` | `'auto' \| 'inherit' \| 'always'` | `'auto'` | Controls `@expo/ui` `<Host>` boundary creation. |
| `initialValues` | `Partial<TValues>` | — | Runtime initial values merged over `config.defaults`. |
| `locale` | `string` | `'en'` | Active locale (`'en'`, `'ur'`, `'ar'`, etc.). |
| `colorScheme` | `'light' \| 'dark'` | Device scheme | Explicit light or dark theme override. |
| `disabled` / `readOnly` / `loading` | `boolean` | `false` | Form-wide interaction state flags. |
| `serverErrors` | `Record<string, string>` | — | External backend field errors mapped onto matching fields. |
| `formErrors` | `string[]` | — | Top-level banner error messages. |
| `onSubmit` | `(values, helpers) => void \| Promise<void>` | — | Invoked with validated values when submission succeeds. |
| `onInvalid` | `(errors, result, values) => void` | — | Invoked when validation blocks submission. |
| `onChange` | `(values, meta) => void` | — | Live form values change callback (`{ changedField, isDirty }`). |
| `onFieldChange` | `(name, value, values) => void` | — | Single-field change callback. |
| `onStepChange` | `(stepIndex, stepId) => void` | — | Invoked on multi-step wizard navigation. |
| `onConfigError` | `(issues: ConfigSchemaIssue[]) => void` | — | Invoked if `config` has standard errors or warnings. |
| `customFields` | `Record<string, FieldComponent>` | — | Scoped custom field renderers for this form. |
| `dataSources` | `Record<string, DataSourceProvider>` | — | Scoped dynamic option providers. |
| `asyncValidators` | `Record<string, AsyncFieldValidator>` | — | Scoped debounced async validators. |
| `actions` | `Record<string, ActionHandler>` | — | Scoped named action handlers. |
| `storageAdapter` | `DraftStorageAdapter` | — | Async storage adapter (`getItem`, `setItem`, `removeItem`) for drafts. |

### Imperative `ExpoFormRef` Handle

```tsx
const formRef = useRef<ExpoFormRef>(null);

await formRef.current?.submit();                                   // Validate & trigger onSubmit
const result = await formRef.current?.validate();                  // Validate entire form (or pass 'email')
const values = formRef.current?.getValues();                       // Read current values snapshot
formRef.current?.setValue('email', 'user@1stfold.com', { shouldValidate: true });
formRef.current?.setValues({ firstName: 'Ahmad', lastName: 'Khan' });
formRef.current?.setError('username', 'Already taken');
formRef.current?.setServerErrors({ email: 'Account suspended' }, ['Unable to complete sign up']);
formRef.current?.clearErrors();
formRef.current?.focus('password');
await formRef.current?.nextStep();                                 // Multi-step wizard control
formRef.current?.previousStep();
await formRef.current?.goToStep(0);
formRef.current?.reset();
await formRef.current?.clearDraft();
```

---

## 11. Plugin & Extension Architecture

Register app-wide plugins once with `<ExpoFormProvider />` (or globally via `registerField` / `registerFormIcon`) and reference them by string ID in any `form.json`:

```tsx
import React from 'react';
import { Row, Text, TextInput, useNativeState } from '@expo/ui';
import {
  ExpoForm,
  ExpoFormProvider,
  type FieldRendererProps,
} from 'native-json-form-builder';

// 1. Define a custom native field renderer ("type": "promoCode" in form.json)
function PromoCodeField({ value, onChange, onBlur, disabled, styles }: FieldRendererProps<string>) {
  const display = value ?? '';
  const state = useNativeState(display);

  React.useEffect(() => {
    if (state.get() !== display) {
      state.set(display);
    }
  }, [display, state]);

  return (
    <Row spacing={8} alignment="center">
      <TextInput
        value={state}
        editable={!disabled}
        placeholder="Enter promo code"
        style={styles.inputStyle}
        textStyle={styles.inputTextStyle}
        onChangeText={(txt) => {
          const upper = txt.toUpperCase();
          if (state.get() !== upper) {
            state.set(upper);
          }
          onChange(upper);
        }}
        onBlur={onBlur}
      />
      <Text>{value === 'EXPO58' ? '20% OFF!' : ''}</Text>
    </Row>
  );
}

// 2. Provide custom fields, async validators, remote data sources, and calculators
export function AppFormRoot({ children }: { children: React.ReactNode }) {
  return (
    <ExpoFormProvider
      locale="en"
      customFields={{
        promoCode: PromoCodeField,
      }}
      asyncValidators={{
        checkEmailAvailable: async ({ value, signal }) => {
          const res = await fetch(`/api/check-email?e=${encodeURIComponent(String(value))}`, { signal });
          const { available } = await res.json();
          return available ? true : 'Email is already registered';
        },
      }}
      dataSources={{
        departments: async ({ query, dependencyValues }) => {
          const res = await fetch(`/api/departments?q=${query ?? ''}&country=${dependencyValues.country ?? ''}`);
          return res.json(); // [{ label: 'Engineering', value: 'eng' }, ...]
        },
      }}
      calculators={{
        taxInclusiveTotal: (values) => Number(values.subtotal ?? 0) * 1.18,
      }}
    >
      {children}
    </ExpoFormProvider>
  );
}
```

### `@expo/ui` Host Modes (`hostMode`)
- **`"auto"` (default)**: Automatically mounts an `@expo/ui` `<Host>` when standalone inside React Native views, and reuses an ancestor `ExpoForm`-managed `<Host>` (tracked via `ManagedHostContext`) without double-wrapping. Because `@expo/ui`'s raw `<Host>` does not expose an external React context, pass `hostMode="inherit"` whenever embedding `<ExpoForm />` directly inside a manually mounted `@expo/ui` `<Host>`.
- **`"inherit"`**: Uses an ancestor `<Host>` directly—required when composing `<ExpoForm />` inside an external `@expo/ui` `<Host>` (such as a custom SwiftUI/Compose screen shell) so a nested `<Host>` is not mounted.
- **`"always"`**: Forces an isolated `<Host>` boundary around the form (bridging via `RNHostView` if already inside a managed `<Host>`).

---

## 12. Security, Privacy & Platform Behavior

- **Store & draft protection (all platforms)**: `password`, `newPassword`, `confirmPassword`, `pin`, `otp`, `cvv`, and any field with `"sensitive": true` (or listed in `security.sensitiveFields`) automatically:
  1. Are excluded from persisted auto-save drafts via `omitSensitiveValues(...)`.
  2. Are replaced with `"[REDACTED]"` when inspected through `redactSensitiveForLog(values, sensitivePaths)`.
  3. Clear automatically on `reset()` when `security.clearSensitiveOnReset` is `true` (default).
- **Platform-level input privacy & screen-capture nuances**:
  - **iOS (SwiftUI)**: Applies view-level `privacySensitive(true)` modifier alongside native `SecureField` / password autofill traits so app-switcher snapshots and system captures redact sensitive fields.
  - **Android (Jetpack Compose)**: Applies `PasswordVisualTransformation` + `KeyboardType.Password` (`autoCorrectEnabled: false`) on password/PIN inputs and Compose `semantics({ contentType })` credential autofill classification on sensitive inputs so cleartext autofill history is not indexed. Because Android enforces screenshot and Recent Apps switcher redaction at the **Activity `Window`** level (`WindowManager.LayoutParams.FLAG_SECURE`) rather than per-Composable view modifiers, screens requiring OS screenshot/recents blocking on Android should enable [`expo-screen-capture`](https://docs.expo.dev/versions/latest/sdk/screen-capture/) (`usePreventScreenCapture()`).
  - **Web**: Uses masked password inputs (`secureTextEntry`) and credential `autoComplete` hints while keeping sensitive values out of `localStorage` drafts.
- **Programmatic scroll-to-field & first-error navigation**:
  - **iOS**: SwiftUI `ScrollView` + `scrollPosition` + `scrollTargetLayout` + `id(anchorId)`.
  - **Android**: Jetpack Compose `ScrollView` + `imePadding()` + `testID(anchorId)` + `onGloballyPositioned` layout tracking + native Compose `BringIntoView` focus anchors (supporting both text inputs and non-text fields such as checkboxes, selects, sliders, and uploads without opening the soft keyboard).
  - **Web**: Smooth `scrollIntoView({ block: 'center' })` DOM anchor scrolling.
- **Upload validation**: `validateSelectedFiles` verifies MIME patterns (`image/*`, `application/pdf`), file extensions, minimum/maximum byte sizes, and maximum file count before storing selected assets.

---

## 13. Included Example App & Ready-Made Schemas

### Ready-to-Use JSON Form Schemas (`forms/`)

| Schema File | Drawer Route | Highlights |
| --- | --- | --- |
| [`forms/custom-form.json`](./forms/custom-form.json) | `/custom-builder` | **Custom Starter Template** + live interactive `form.json` Studio & Generator |
| [`forms/register.json`](./forms/register.json) | `/register` | **All 88 built-in field types** across 7 collapsible sections, EN/UR RTL i18n, async checks, password strength meter |
| [`forms/login.json`](./forms/login.json) | `/login` | Multi-mode sign-in (`Password`, `Phone OTP`, `Quick PIN`) + conditional 2FA TOTP |
| [`forms/forgot-password.json`](./forms/forgot-password.json) | `/forgot-password` | 3-step password recovery wizard (`lookup` → `verify` → `new-password`) |
| [`forms/checkout.json`](./forms/checkout.json) | `/checkout` | E-commerce checkout with live `computed` subtotal, custom `promoCode` field, and Card / Wallet / COD modes |
| [`forms/kyc-wizard.json`](./forms/kyc-wizard.json) | `/kyc-wizard` | Multi-step merchant KYC verification with PDF upload, sliders, and signature |
| [`forms/job-application.json`](./forms/job-application.json) | `/job-application` | Candidate application with `repeater` work history, `searchableMultiSelect` skills, PDF resume, and signature |
| [`forms/contact-support.json`](./forms/contact-support.json) | `/contact-support` | Support ticket with priority chips, multi-image screenshots, and conditional phone callback scheduling |
| [`forms/feedback-survey.json`](./forms/feedback-survey.json) | `/feedback-survey` | Product feedback & NPS survey with 5-star rating, slider, color picker, and date range |
| [`forms/vehicle-registration-enterprise.json`](./forms/vehicle-registration-enterprise.json) | `/enterprise-vehicle` | **Enterprise Showcase (Levels 1–4)**: `FormulaEngine` (`SUM`, `ROUND`, `IF`), `skipWhen` step workflow, reorderable repeater, `qrCode` / `documentScan` / `coordinates` / `signature`, and `finance-enterprise` theme |
| [`forms/all-fields-showcase.json`](./forms/all-fields-showcase.json) | — | Standalone reference catalog of field configurations |

### Running Verification & the Interactive Expo Router Drawer App

```bash
# Typecheck library & example app
npm run typecheck
npm run typecheck:example

# Run automated Vitest test suite
npm test

# Build distributable package into dist/
npm run build

# Launch the Expo Router Drawer showcase (including Custom form.json Studio)
cd example
npm install
npx expo start
```

---

## 14. Enterprise Engine, Workflows, Native Capabilities & Tooling (Levels 1–4)

In addition to rendering all 88 built-in `@expo/ui` field types, `native-json-form-builder` provides a modular enterprise architecture (see [`docs/UPGRADE_GUIDE.md`](./docs/UPGRADE_GUIDE.md) and [`docs/SECURITY_AND_COMPATIBILITY.md`](./docs/SECURITY_AND_COMPATIBILITY.md) for complete documentation):

- **Level 1 — Intelligent Form Engine**: 10-stage `SchemaCompiler` with FNV-1a fingerprinting & LRU cache, cycle-safe `DependencyGraph`, `O(depth + affectedListeners)` `PathSubscriptionIndex`, zero-`eval` `FormulaEngine` (`'calculated'` fields, 27 functions, `$item.*` / `items.*.*` repeater aggregations), named reusable `ConditionRegistry` (`readOnlyWhen`, field-to-field comparisons), `DataSourceManager` (`static`, `provider`, `rest` with `AbortController` + TTL cache), and `AsyncValidationManager`.
- **Level 2 — Enterprise Workflows**: `DraftManager` (versioned TTL + conflict recovery + secret exclusion), `OfflineSubmissionQueue` (idempotency keys + exponential backoff), `StepWorkflowController` (`skipWhen`), 9-state `SubmissionLifecycleMachine`, `ApprovalWorkflowEngine`, RBAC `PermissionsPolicy` + `extractServerPermissionManifest`, `buildServerUploadPolicyManifest`, `SchemaVersionRegistry`, and `RemoteSchemaManager`.
- **Level 3 — Advanced Native Experience**: `PlatformCapabilityRegistry` (`barcode` / `qrCode`, `documentScan`, drawn `signature`, GPS `coordinates` adapters with universal `@expo/ui` fallbacks), 3-tier phone/tablet/desktop grid (`desktopColumns`), and Eastern Arabic / Urdu / European comma-decimal `parseNumericInput`.
- **Level 4 — Developer Platform**: Isolated `PluginRegistry`, `createFieldPackage`, `MiddlewarePipeline`, `ThemeRegistry` (`default`, `compact`, `high-contrast`, `finance-enterprise`), `generateFormValuesTypeScript`, `diffFormSchemas`, secret-redacting `inspectFormRuntime`, and opt-in `PerformanceProfiler`.
- **Lifecycle, Live Schema Reconciliation & Race Integrity**: Deterministic `initialValues` sync (`resetKey`, `enableReinitialize`, `keepDirtyOnReinitialize`), same-ID `reconcileSchema` (`renamedFields`, added/removed/modified field migration & pruning), and fail-closed async validation snapshot verification on `submit()`, `validate()`, and `nextStep()`.

### Tested Compatibility Matrix

| Package / Runtime | Tested Version | Peer / Engine Range |
| --- | --- | --- |
| `expo` | `55.0.6` | `>=55.0.0` |
| `@expo/ui` | `58.0.25` | `>=55.0.0` |
| `react` | `19.2.0` | `>=19.0.0` |
| `react-native` | `0.83.2` | `>=0.81.0` |
| `react-native-web` | `0.21.0` | `~0.21.0` |
| `ajv` / `ajv-formats` | `8.18.0` / `3.0.1` | `^8.18.0` / `^3.0.1` |
| `typescript` | `5.9.2` | `>=5.5.0` |
| Node.js (Tooling / CI) | `20.x` / `22.x` | `>=20.0.0` |

---

## License

Apache-2.0
