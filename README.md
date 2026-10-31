# Native JSON Form Builder (`ExpoForm`)

A reusable, schema-driven **Native JSON Form Builder & Renderer** for React Native and Expo SDK 58+, built on **`@expo/ui`** (SwiftUI on iOS, Jetpack Compose on Android, universal Web support) and **AJV JSON Schema 2020-12**.

Render complete, accessible, keyboard-aware native forms—including **88 built-in field types**, password visibility toggles, live strength meters, input masks, dynamic/dependent searchable pickers, media & document uploads, conditional logic, computed fields, repeaters, and multi-step wizards—from a single declarative JSON configuration.

---

## Minimal Usage

```tsx
import { ExpoForm } from 'native-json-form-builder';
import registerForm from 'native-json-form-builder/forms/register.json';

export default function RegisterScreen() {
  return (
    <ExpoForm
      config={registerForm}
      onSubmit={async (values, helpers) => {
        // Validated, typed form values ready for your API
      }}
      onChange={(values) => {
        // Optional live change listener
      }}
    />
  );
}
```

---

## Architecture & `@expo/ui` Foundation

`native-json-form-builder` renders genuine platform-native primitives through `@expo/ui`:

- **Universal `@expo/ui` layer**: `Host`, `Column`, `Row`, `ScrollView`, `Text`, `TextInput`, `Button`, `Switch`, `Slider`, `Checkbox`, `Picker`, `BottomSheet`, `Collapsible`, `FieldGroup`, `List`, `ListItem`, `Icon`, `RNHostView`, `Spacer`, and `useNativeState` (`ObservableState<T>`).
- **Platform-specific native modifiers (`src/core/nativePlatformBridge.*`)**:
  - **iOS (SwiftUI)**: `animation(Animation.*)`, `scrollPosition`, `scrollTargetLayout`, `scrollDismissesKeyboard`, `privacySensitive`, `accessibilityLabel` / `accessibilityHint` / `accessibilityValue` / `accessibilityAddTraits`, and SwiftUI `ColorPicker`.
  - **Android (Jetpack Compose)**: `imePadding()`, `animateContentSize()`, `graphicsLayer()`, and `semantics()`.
  - **Web**: Zero native-module runtime dependencies—resolves cleanly with `react-native-web` and CSS smooth scrolling.
- **Fine-grained native state (`FormStore` + `useNativeTextState`)**: Keystrokes flow through `@expo/ui` `ObservableState<string>` without re-rendering unrelated fields or resetting cursor selection; programmatic `setValue` / `reset` / mask updates synchronize back cleanly.

### Modular Source Layout

```text
src/
├── core/         # <ExpoForm />, <ExpoFormProvider />, HostBoundary, JSON config parser, platform bridge
├── renderer/     # FormRenderer, SectionRenderer, StepWizardRenderer, FieldNodeRenderer, FieldWrapper
├── fields/       # All 88 built-in field renderers across 7 categories + extensible FieldRegistry
├── validation/   # AJV JSON Schema 2020-12 + Layer-2 regex, format, cross-field, password & async engine
├── conditions/   # Declarative boolean condition trees (and/or/not) & non-eval computed formulas
├── state/        # Subscription-scoped FormStore, useFormSelector, useNativeTextState, draft persistence
├── keyboard/     # Native keyboard avoidance, focus chaining (Next/Done/Submit), lazy List threshold
├── animations/   # 12 lifecycle animation triggers + OS reduced-motion adapter
├── styles/       # JSON style tokens, state overrides (focus/invalid/disabled), light/dark theme palettes
├── pickers/      # NativeSelectPicker, SearchablePicker (BottomSheet, dependent reset, remote pagination)
├── uploads/      # Camera, gallery, document & web file adapter + MIME/extension/size validation
├── icons/        # Logical icon dictionary -> SF Symbols (iOS), Material Symbols (Android), Web fallback
├── types/        # Complete strict TypeScript contracts + defineFormConfig() helper
└── utils/        # Deep path immutables, masking, localization/RTL, countries/timezones, security redaction
```

---

## Complete Built-In Field Catalogue (88 Types)

| Category | Built-In `type` Values |
| --- | --- |
| **A. Text & Personal (20)** | `text`, `firstName`, `middleName`, `lastName`, `fullName`, `username`, `email`, `phone`, `emailOrPhone`, `password`, `confirmPassword`, `pin`, `otp`, `textarea`, `search`, `masked`, `organization`, `jobTitle`, `website`, `url` |
| **B. Numeric & Financial (11)** | `number`, `integer`, `decimal`, `currency`, `percentage`, `age`, `quantity`, `price`, `phoneExtension`, `slider`, `rangeSlider` |
| **C. Selection & Choice (14)** | `checkbox`, `checkboxGroup`, `switch`, `radioGroup`, `select`, `searchableSelect`, `multiSelect`, `searchableMultiSelect`, `autocomplete`, `chips`, `tagInput`, `segmentedControl`, `rating`, `colorPicker` |
| **D. Date & Time (9)** | `date`, `time`, `dateTime`, `dateRange`, `birthday`, `month`, `year`, `duration`, `timezone` |
| **E. Address & Location (9)** | `address`, `addressLine1`, `addressLine2`, `country`, `state`, `city`, `postalCode`, `coordinates`, `locationSearch` |
| **F. File & Media Uploads (11)** | `image`, `camera`, `avatar`, `video`, `audio`, `document`, `pdf`, `file`, `multipleFiles`, `multipleImages`, `signature` |
| **G. Structural & Advanced (14)** | `heading`, `description`, `staticText`, `divider`, `section`, `fieldGroup`, `hidden`, `readOnly`, `computed`, `repeater`, `objectGroup`, `arrayGroup`, `conditionalGroup`, `stepGroup` |

---

## Two-Layer Validation Engine

1. **Layer 1 — Standard JSON Schema 2020-12 (`ajv/dist/2020` + `ajv-formats`)**:
   Supports `type`, `required`, `properties`, `minLength`, `maxLength`, `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `pattern`, `format`, `enum`, `const`, `items`, `minItems`, `maxItems`, `uniqueItems`, `allOf`, `anyOf`, `oneOf`, `not`, `if` / `then` / `else`, `dependentRequired`, plus custom schema keywords (`equalsField`, `notBeforeField`, `minAge`, `errorMessage`).
2. **Layer 2 — Practical Form, Cross-Field & Async Validation**:
   - **Built-in formats & presets**: Email, Pakistani & international E.164 phone numbers (dynamically linked to `countryField`), `emailOrPhone`, Pakistani CNIC (`#####-#######-#`), country-aware postal codes, URLs, and usernames.
   - **Password & `confirmPassword`**: Min/max length, uppercase, lowercase, digit, special character, no-spaces rule, live 0–4 strength score & meter, native interactive `eye` / `eye-off` toggle without cursor/text loss, and `equalsField: "password"`.
   - **Cross-field & conditional rules**: `requiredWhen`, `equalsField`, `notEqualsField`, `greaterThanField`, `lessThanField`, `notBeforeField`, `notAfterField`, `dateRange` (`end >= start`), `minAge` / `maxAge`, and `atLeastOneOf`.
   - **Hidden-field skipping**: Fields hidden via `visibleWhen` / `hiddenWhen` (or inside hidden sections/groups) are automatically excluded from blocking submission.
   - **Debounced async & server validation**: Reference registered `asyncValidators` by `validatorId` in JSON (stale requests are aborted automatically via `AbortController`), and map backend API errors via `helpers.setServerErrors(...)` or `formRef.current.setServerErrors(...)`.

---

## Top-Level JSON Configuration Reference

```json
{
  "id": "user-registration",
  "version": "1.0.0",
  "title": { "en": "Create Account", "ur": "اکاؤنٹ بنائیں" },
  "description": "Declarative native form configuration",
  "schema": { "$schema": "https://json-schema.org/draft/2020-12/schema", "type": "object" },
  "defaults": { "country": "PK" },
  "fields": [],
  "sections": [],
  "steps": [],
  "layout": { "columns": 1, "tabletColumns": 2, "rowGap": 16, "columnGap": 12 },
  "style": {},
  "theme": { "mode": "system", "seedColor": "#2563EB" },
  "animations": { "enabled": true, "respectReducedMotion": true, "preventLayoutJumps": true },
  "scroll": { "enabled": true, "keyboardAware": true, "bottomContentInset": 28 },
  "keyboard": { "autoAdvanceFocus": true, "submitOnLastField": true },
  "validation": { "mode": "onBlur", "scrollToFirstError": true, "focusFirstError": true },
  "submit": { "label": "Create Account", "showReset": true },
  "accessibility": { "announceValidationErrors": true, "minTouchTargetSize": 44 },
  "i18n": { "locale": "en", "direction": "auto" },
  "draft": { "enabled": false, "excludeSensitive": true },
  "security": { "protectSensitiveFields": true, "clearSensitiveOnReset": true }
}
```

> Ready-to-run complete JSON schemas are included in [`forms/register.json`](./forms/register.json), [`forms/kyc-wizard.json`](./forms/kyc-wizard.json), and [`forms/all-fields-showcase.json`](./forms/all-fields-showcase.json).

---

## Host Management, Provider & Imperative `ref` API

### Host Modes (`hostMode`)
- `"auto"` *(default)*: Creates a single outer `@expo/ui` `<Host>` automatically unless already inside a parent `HostBoundary` / `ExpoFormProvider`.
- `"inherit"`: Renders directly inside an ancestor `<Host>` (ideal when embedding multiple forms or custom `@expo/ui` toolbars on one screen).
- `"always"`: Explicitly creates a dedicated `<Host>` boundary around the form.

### Imperative `ExpoFormRef` Methods

```tsx
const formRef = useRef<ExpoFormRef>(null);

await formRef.current?.submit();
await formRef.current?.validate();
const values = formRef.current?.getValues();
formRef.current?.setValue('email', 'user@example.com', { shouldValidate: true });
formRef.current?.setError('email', 'Already registered');
formRef.current?.clearErrors();
formRef.current?.focus('password');
formRef.current?.reset();
```

### Registering Custom Field Renderers, Validators & Data Sources

No executable JavaScript is ever stored in JSON. Register custom components, remote data sources, and async validators in code via `<ExpoFormProvider />` or `registerField()`:

```tsx
import { ExpoForm, ExpoFormProvider, registerField } from 'native-json-form-builder';

registerField('customBadge', CustomBadgeRenderer);

<ExpoFormProvider
  locale="en"
  asyncValidators={{
    checkEmailAvailable: async ({ value }) =>
      value === 'taken@example.com' ? 'Email already in use' : true,
  }}
  dataSources={{
    departments: async ({ query }) => fetchDepartments(query),
  }}
>
  <ExpoForm config={myFormJson} onSubmit={handleSubmit} />
</ExpoFormProvider>
```

---

## Security, Accessibility & Localization

- **Sensitive field protection**: `password`, `confirmPassword`, `pin`, `otp`, and any field marked `"sensitive": true` (or listed in `security.sensitiveFields`) apply SwiftUI `privacySensitive`, are automatically stripped from persisted drafts (`omitSensitiveValues`), are redacted by `redactSensitiveForLog`, and clear on `reset()`.
- **Upload safety**: `validateSelectedFiles` enforces MIME wildcards (`image/*`, `application/pdf`), allowed extensions, min/max byte sizes, and max file counts before accepting assets.
- **Accessibility & RTL**: Screen-reader announcements via `AccessibilityInfo.announceForAccessibility`, SwiftUI accessibility traits/labels/hints/values, Jetpack Compose `semantics`, 44pt minimum touch targets, OS reduced-motion compliance, and automatic RTL layout for locales such as Urdu (`ur`) and Arabic (`ar`).

---

## Development & Verification

```bash
# Typecheck library & example Expo app
npm run typecheck
npm run typecheck:example

# Run Vitest unit + component integration suite
npm test

# Build distributable JavaScript + TypeScript declarations into dist/
npm run build
```

To run the interactive Expo SDK 58 showcase app in [`example/`](./example):

```bash
cd example
npm install
npx expo start
```

---

## License

Apache-2.0
