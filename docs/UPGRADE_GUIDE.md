# Enterprise Form Engine & Developer Platform Guide (Levels 1–4)

`native-json-form-builder` layers an enterprise-grade reactive form engine, offline/workflow controllers, hardware capability adapters, and isolated plugin platform on top of `@expo/ui` while preserving 100% backward compatibility with existing `form.json` configurations.

---

## Architectural Separation of Concerns

Three subsystems remain strictly decoupled through typed interfaces and events:

1. **Form Definition (`src/compiler`, `src/formula`, `src/conditions`, `src/versioning`, `src/remote`)**
   - Declarative JSON schemas compiled once via `SchemaCompiler` into a fingerprinted, LRU-cached `CompiledFormPlan` (`DependencyGraph` + parsed `FormulaASTNode`s + `ConditionRegistry`).
   - Zero executable JavaScript in JSON (`eval` and `new Function` are never used).
2. **Form Runtime (`src/state`, `src/datasources`, `src/validation`, `src/capabilities`, `src/fields`)**
   - Reactive `FormStore` executing incremental topological formula & condition propagation inside batched updates, `DataSourceManager` (`static`, `provider`, `rest` with `AbortController` + LRU/TTL cache), `AsyncValidationManager`, and `@expo/ui` field renderers.
3. **Submission Workflow (`src/persistence`, `src/workflows`)**
   - Optional controllers (`DraftManager`, `OfflineSubmissionQueue`, `RemoteDraftSyncController`, `SubmissionLifecycleMachine`, `ApprovalWorkflowEngine`, `StepWorkflowController`, `PermissionsPolicy`) that subscribe to or wrap runtime state without bloating simple forms.

---

## Level 1 — Unified Intelligent Core

### Restricted Formula Engine & `'calculated'` Fields

```json
{
  "name": "lineItems",
  "type": "repeater",
  "reorderable": true,
  "fields": [
    { "name": "qty", "type": "quantity", "defaultValue": 1 },
    { "name": "price", "type": "currency", "defaultValue": 0 },
    {
      "name": "lineTotal",
      "type": "calculated",
      "formula": "ROUND(COALESCE($item.qty, 0) * COALESCE($item.price, 0), 2)"
    }
  ]
},
{
  "name": "grandTotal",
  "type": "calculated",
  "formula": "ROUND(SUM(lineItems.*.lineTotal) * 1.18, 2)"
}
```

- **27 Built-in Functions**: `SUM`, `AVG`, `MIN`, `MAX`, `ROUND`, `FLOOR`, `CEIL`, `ABS`, `COALESCE`, `IF`, `AND`, `OR`, `NOT`, `CONCAT`, `LEN`, `LOWER`, `UPPER`, `TRIM`, `CONTAINS`, `TODAY`, `NOW`, `YEAR`, `DAYS_BETWEEN`, `AGE`, `COUNT`, `INCLUDES`, `IS_EMPTY`.
- **Repeater Wildcards & Scopes**: `$item.*`, `$parent.*`, `$index`, and root aggregations (`items.*.amount`).
- **Cycle & Depth Protection**: Tarjan SCC cycle detection during `SchemaCompiler.compile()` and `MAX_FORMULA_AST_DEPTH = 32`.

### Reusable Conditions & Rich Operators

Define reusable conditions under `config.conditions` and reference them via `"$condition:name"` or `{ "$condition": "name" }` across `visibleWhen`, `hiddenWhen`, `enabledWhen`, `disabledWhen`, `readOnlyWhen`, `requiredWhen`, and step `skipWhen`.

### Reactive Data Sources & Multi-Rule Async Validation

- `DataSourceManager` supports `'static'`, `'provider'`, and declarative `'rest'` endpoints (`https://api.example.com/cities?country={{country}}`) with `authProviders` (never hardcoding tokens in JSON), cascading invalidation, pagination, search debounce, `AbortController`, and TTL caching.
- `AsyncValidationManager` supports multi-rule async checks, `dependsOn` cross-field triggers, retry backoff, result caching, and `normalizeServerValidationErrors()` mapping RFC 7807 / nested API errors to dot-paths.

---

## Level 2 — Enterprise Form Workflows

- **`DraftManager`**: Versioned draft envelopes with TTL expiration, secret-field redaction (`password`, `pin`, `otp`, `cvv`, `sensitive: true`), schema migration via `SchemaVersionRegistry`, and conflict policies (`newestWins`, `localWins`, `remoteWins`, `manual`).
- **`OfflineSubmissionQueue`**: Persistent FIFO queue with idempotency keys, exponential retry backoff, file reference checks, and `ConnectivityAdapter` auto-flush.
- **`SubmissionLifecycleMachine` & `ApprovalWorkflowEngine`**: Enforces the 9-state lifecycle (`draft` → `validating` → `queued_offline` → `submitting` → `submitted` → `under_review` → `changes_requested` / `approved` / `rejected`) and multi-stage RBAC approvals with immutable audit trails.
- **`PermissionsPolicy` Security Boundary**: Client-side `view` / `edit` / `approve` rules control UX presentation only. Use `extractServerPermissionManifest(config)` to enforce identical authorization rules on your backend API.
- **`RemoteSchemaManager`**: ETag/TTL remote schema loader with structural safety validation and cached fallback.

---

## Level 3 — Advanced Native Experience

- **`PlatformCapabilityRegistry`**: Detects & validates `camera`, `gallery`, `documentPicker`, `documentScanner`, `signature`, `barcodeScanner`, `location`, and `nativeDatePicker` against `config.capabilities`, reporting `missingRequired` vs `degradedOptional` fallbacks.
- **Optional Hardware Adapters**:
  - `registerBarcodeScannerAdapter` (`'barcode'`, `'qrCode'` fields with format filter, safe regex `extractPattern`, duplicate-scan guard, and `@expo/ui` manual input fallback).
  - `registerDocumentScannerAdapter` (`'documentScan'` field with multi-page PDF merge and camera/file fallback).
  - `registerSignatureAdapter` (`'signature'` field with drawn PNG/SVG capture and `@expo/ui` BottomSheet fallback).
  - `registerLocationAdapter` (`'coordinates'` field GPS `"Use Current Location"` button).
- **3-Tier Responsive Grid & Locale Numerals**:
  - `columns` (phone), `tabletColumns` (`>= tabletBreakpoint`), and `desktopColumns` (`>= desktopBreakpoint`).
  - `parseNumericInput` normalizes Eastern Arabic (`٠-٩`), Urdu/Persian (`۰-۹`), and European comma-decimal (`1.234,56`) inputs.

---

## Level 4 — Developer Platform, Tooling & Diagnostics

### Isolated `PluginRegistry` & `createFieldPackage`

```tsx
import {
  ExpoForm,
  ExpoFormProvider,
  PluginRegistry,
  createFieldPackage,
} from 'native-json-form-builder';
import { TextInput, useNativeState } from '@expo/ui';

const ibanField = createFieldPackage<string, { countryPrefix?: string }>({
  type: 'ibanAccount',
  component: ({ value, onChange, styles, customProps }) => {
    const state = useNativeState(String(value ?? customProps?.countryPrefix ?? 'PK'));
    return (
      <TextInput
        value={state}
        style={styles.inputStyle}
        textStyle={styles.inputTextStyle}
        onChangeText={(next) => {
          state.set(next.toUpperCase());
          onChange(next.toUpperCase());
        }}
      />
    );
  },
  defaultValidator: (val) =>
    typeof val === 'string' && val.length >= 16 ? null : 'Invalid IBAN length',
});

const plugins = new PluginRegistry();
plugins.register({
  id: '@acme/banking',
  fields: [ibanField],
  formulaFunctions: {
    IBAN_COUNTRY: (iban) => String(iban ?? '').slice(0, 2),
  },
});
```

### Schema Tooling & Secret-Safe Diagnostics

- `generateFormValuesTypeScript(schema)` — Generates TypeScript interfaces directly from any `FormConfig`.
- `diffFormSchemas(prev, next)` & `validateMigrationChain(...)` — Detects breaking vs non-breaking schema evolutions before deployment.
- `inspectFormRuntime(store)` — Secret-safe runtime snapshot (`REDACTED_SENSITIVE_TOKEN` automatically masks all sensitive paths).
- `PerformanceProfiler` — Opt-in latency & render counter with zero overhead when disabled.

---

## Public API Semver Guarantees

- **Patch (`x.y.Z`)**: Bug fixes, accessibility/keyboard refinements, internal compiler optimizations.
- **Minor (`x.Y.0`)**: Additive optional JSON schema keywords, new built-in functions/operators, new optional adapters and tooling exports. Existing `form.json` files continue to work unchanged.
- **Major (`X.0.0`)**: Removal or incompatible signature change of documented exports in `src/index.ts` or breaking changes to `schema/expo-form.schema.json`.
