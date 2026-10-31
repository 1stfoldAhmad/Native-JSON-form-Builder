# Security Boundaries, Lifecycle Contracts & Tested Compatibility Matrix

This document defines the client/server trust boundaries, dynamic lifecycle guarantees, and tested runtime compatibility matrix for **`native-json-form-builder`**.

---

## 1. Client vs. Server Security Boundaries

`native-json-form-builder` executes on end-user mobile and web devices. Every client-side check optimizes **user experience, responsiveness, and local data hygiene**, while **trust and authorization must always be enforced on the server**.

### 1.1 Validation & Conditional Visibility Are Not Authorization

- **Client behavior**: `visibleWhen`, `hiddenWhen`, `enabledWhen`, `disabledWhen`, `readOnlyWhen`, `skipWhen`, and `permissions` (`PermissionsPolicy`) hide or disable fields in the native UI and omit hidden fields when `behavior.omitHiddenFieldsOnSubmit` is enabled.
- **Server requirement**: A modified client or direct HTTP caller can submit arbitrary JSON keys regardless of client-side visibility or role gates.
  - Extract the canonical permission manifest using `extractServerPermissionManifest(config)`.
  - Strip or reject any field path where the authenticated caller lacks `editableRoles` on the backend.
  - Re-run `ValidationEngine` (or your canonical JSON Schema / domain validator) on the server before persisting data.

### 1.2 Server-Side File Upload Verification (`buildServerUploadPolicyManifest`)

- **Client behavior**: `validateSelectedFiles()` checks picker-reported `mimeType`, file extension, `minFileSize` / `maxFileSize`, and `maxFiles` before storing `FormFileAsset` entries.
- **Server requirement**: Picker-reported `mimeType`, `name`, and `size` can be forged by a malicious client. Use `buildServerUploadPolicyManifest(config)` to export per-field upload policies and enforce all five server checks on your upload endpoint:
  1. **`authenticatedSession`**: Require short-lived, authenticated upload tokens or pre-signed URLs scoped to the user and form.
  2. **`magicByteSniffing`**: Verify actual file signatures (magic bytes) on the server rather than trusting `Content-Type` or filename extensions.
  3. **`contentLengthLimit`**: Enforce hard byte-stream limits matching `maxFileSize` at the reverse proxy / object-storage policy layer.
  4. **`serverGeneratedStorageKey`**: Store objects under server-generated UUID keys (never raw user filenames) and serve downloads with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
  5. **`malwareScan`**: Quarantine and scan uploaded binaries before making them accessible to downstream reviewers.

### 1.3 Sensitive & Secret Field Guarantees

- **Immutable built-in secret types**: `password`, `newPassword`, `confirmPassword`, `pin`, `otp`, and `cvv` are **unconditionally treated as sensitive**, even if a JSON config sets `"sensitive": false` (which also emits a `configParser` warning).
- **Custom sensitive fields**: Any field with `"sensitive": true` or listed in `config.security.sensitiveFields` receives the same protections:
  - **Draft persistence**: Excluded from `DraftManager` payloads unless `includeSensitive: true` is explicitly configured with an encrypted `DraftStorageAdapter` (e.g., `expo-secure-store`).
  - **Offline submission queue**: Stripped before persisting queued payloads unless `allowSensitivePersistence: true` is explicitly enabled on an encrypted storage adapter.
  - **Diagnostics & logs**: Redacted via `redactSensitiveValues()` / `inspectFormRuntime()` (`"[REDACTED]"`).
  - **Native UI**: Masked input (`SecureField` on SwiftUI, masked `BasicTextField` on Jetpack Compose) + iOS SwiftUI `privacySensitive(true)` modifier.
- **Secrets in JSON configs**: Never embed API keys, bearer tokens, or signing secrets in JSON form schemas. Inject request credentials dynamically at runtime through `ExpoFormProvider`'s `authHeaderProvider` or `dataSourceFetch`.

### 1.4 ReDoS & Untrusted Remote Schema Hardening

All regular expressions across **every** entry point are validated by `isSafeRegexPattern()` / `compileSafeRegex()` and guarded by `MAX_REGEX_INPUT_LENGTH` (`4096` chars):

| Surface | Protection |
| --- | --- |
| `field.validation.regex` / `cnic.pattern` / `phone.pattern` / `password.specialCharPattern` | Checked statically in `parseAndValidateFormConfig` & `SchemaCompiler`, and fail-closed at runtime in `ValidationEngine` |
| `field.scan.extractPattern` (`barcode` / `qrCode`) | Checked statically in `parseAndValidateFormConfig` and fail-closed + length-capped in `BarcodeScannerFieldRenderer` |
| Condition `matches` (inline, section, step `skipWhen`, and top-level `config.conditions`) | Checked statically in `parseAndValidateFormConfig` and evaluated via `safeRegexTest` |
| JSON Schema `pattern` (`validationSchema` / `field.schema`) | Inspected recursively via `inspectSchemaRegexPatterns` before `ajv.compile` |
| `RemoteSchemaManager` | Runs `parseAndValidateFormConfig` + `isEngineVersionCompatible` + `compileFormSchema` before caching or activating remote JSON |

---

## 2. Dynamic `initialValues` & Live Schema Reconciliation Contracts

### 2.1 `initialValues` Synchronization Modes (`<ExpoForm />`)

To prevent accidental loss of in-progress user edits when parent components re-render with inline object literals (`initialValues={{ country: 'PK' }}`), `<ExpoForm />` follows deterministic synchronization rules:

1. **Mount & `config.id` change**: Always initializes values from the new `config` defaults + `initialValues`.
2. **`resetKey` prop change (`Object.is`)**: Explicitly resets the form to the latest `initialValues` whenever `resetKey` changes (recommended when switching records in a master-detail view).
3. **`enableReinitialize={true}`**: Deep-compares `initialValues` across renders and re-hydrates when external values genuinely change. Combine with `keepDirtyOnReinitialize={true}` to preserve fields the user has already modified while updating clean fields.
4. **Imperative API**: Call `formRef.current?.setValues(nextValues)` or `formRef.current?.reset(nextValues)` at any time.

### 2.2 Same-ID Schema Reconciliation (`reconcileSchema` & `renamedFields`)

When `config` updates while keeping the same `config.id` (e.g., live Studio editing or hot-reloaded remote schemas):

- **Added fields**: Hydrated with their `defaultValue`, `defaultFormula`, or type-safe empty value (`false` for boolean toggles, `[]` for multi-select/repeater).
- **Removed fields**: Pruned from `values`, `initialValues`, `errors`, `dirtyFields`, `touchedFields`, `validatingFields`, and `filesByField` (including nested `objectGroup` and `repeater` row properties).
- **Renamed fields**: Pass `renamedFields={{ oldFieldName: 'newFieldName' }}` on `<ExpoForm />` or `formRef.current?.reconcileSchema(nextConfig, { renamedFields })` to migrate values, dirty/touched flags, errors, and uploaded files seamlessly before pruning old keys.
- **Modified fields**: Compatible values are preserved; incompatible types are coerced/reset to the updated field's default, stale choice selections not in the new static `options` list are cleared, `repeater.maxItems` reductions clamp excess items, and upload constraints (`maxFiles`, MIME/size) prune invalid `FormFileAsset` entries.

### 2.3 End-to-End Async Validation & Submission Race Integrity

- Mutating any field while `submit()`, `validate()`, or `nextStep()` is awaiting async validators invalidates the stale pass, re-verifies the latest snapshot, and **fails closed** if values remain unverified or `reset()` / `config.id` changes mid-flight.
- `onSubmit` receives the **exact immutable snapshot** verified by synchronous + asynchronous + JSON Schema validation, and is also blocked when `<ExpoForm loading={true} />` is active.

---

## 3. Tested Compatibility Matrix

The table below lists the exact peer/runtime versions verified in automated CI (`typecheck`, `vitest`, `tsc -p tsconfig.build.json`, Expo Web static export, Android Gradle Debug APK, and iOS Xcode Simulator build):

| Dependency / Runtime | Tested Version | Supported Range | Notes |
| --- | --- | --- | --- |
| **`expo`** | `55.0.6` | `>=55.0.0` | Expo SDK 55+ New Architecture |
| **`@expo/ui`** | `58.0.25` | `>=55.0.0` | Universal primitives + SwiftUI (`.ios`) + Jetpack Compose (`.android`) |
| **`react`** | `19.2.0` | `>=19.0.0` | Concurrent-safe `useSyncExternalStore` selectors |
| **`react-native`** | `0.83.2` | `>=0.81.0` | iOS, Android, and Web (`react-native-web ~0.21.0`) |
| **`expo-image-picker`** | `55.0.13` | `>=55.0.0` | Optional peer (lazy-loaded on media/camera field interaction) |
| **`expo-document-picker`** | `55.0.9` | `>=55.0.0` | Optional peer (lazy-loaded on file/PDF field interaction) |
| **`ajv` / `ajv-formats`** | `8.18.0` / `3.0.1` | `^8.18.0` / `^3.0.1` | Draft 2020-12 JSON Schema validation |
| **`typescript`** | `5.9.2` | `>=5.5.0` | Strict mode (`noEmit` + `tsconfig.build.json` declarations) |
| **Node.js (Build / CI)** | `20.x` / `22.x` | `>=20.0.0` | Used for TypeScript build, Vitest suite, and CLI schema checks |
