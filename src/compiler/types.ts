import type { DependencyGraph } from '../engine/DependencyGraph';
import type { FormulaASTNode } from '../formula/parser';
import type {
  AsyncFieldValidationConfig,
  ConditionExpression,
  ConfigSchemaIssue,
  FieldConfig,
  FieldDataSourceConfig,
  FormConfig,
  PlatformCapabilityName,
} from '../types';

export const SCHEMA_COMPILER_VERSION = 1;

export interface CompiledFieldNode {
  /** Concrete field path (`baseFee`, `address.city`) or repeater template path (`items.*.qty`). */
  path: string;
  /** True when nested inside one or more repeater/array containers (`path` contains `.*`). */
  isRepeaterTemplate: boolean;
  /** Enclosing repeater wildcard prefix if `isRepeaterTemplate` (e.g. `items.*`). */
  repeaterPrefix?: string;
  /** Original `FieldConfig`. */
  field: FieldConfig;
  /** Parsed AST for `field.formula` when valid. */
  formulaAst?: FormulaASTNode;
  /** Parsed AST for `field.defaultFormula` when valid. */
  defaultFormulaAst?: FormulaASTNode;
  /** Resolved data source descriptor (inline `field.dataSource` merged over `config.dataSources[id]`). */
  dataSource?: FieldDataSourceConfig;
  /** Normalized async validation rule array. */
  asyncRules: readonly AsyncFieldValidationConfig[];
  /** Whether this field holds sensitive data (excluded from drafts/logs). */
  isSensitive: boolean;
  /** Whether this field is a built-in secret type (`password`, `pin`, `otp`, etc.) that cannot opt out. */
  isBuiltInSecret: boolean;
  /** Section ID owning this field if defined inside `sections`. */
  sectionId?: string;
  /** Step ID owning this field if defined inside `steps`. */
  stepId?: string;
}

export interface CompiledFormPlan {
  readonly compilerVersion: number;
  /** Full canonical fingerprint of the entire `FormConfig`. */
  readonly fingerprint: string;
  /** Structural fingerprint excluding volatile non-structural keys (`defaults`, `i18n`, `title`, `description`). */
  readonly structuralFingerprint: string;
  readonly formId: string;
  readonly config: FormConfig;
  /** Lookup map of `path -> CompiledFieldNode` (includes repeater template paths `items.*.sub`). */
  readonly nodes: ReadonlyMap<string, CompiledFieldNode>;
  /** Ordered list of all compiled field nodes. */
  readonly nodeList: readonly CompiledFieldNode[];
  /** Unified forward + reverse reactive dependency graph. */
  readonly graph: DependencyGraph;
  /** Deterministic topological order of formula template paths (`baseSubtotal` before `grandTotal`). */
  readonly formulaEvalOrder: readonly string[];
  /** Field paths carrying `defaultFormula`. */
  readonly defaultFormulaPaths: readonly string[];
  /** Reusable named conditions (`config.conditions`). */
  readonly namedConditions: Record<string, ConditionExpression>;
  /** Schema-level `required` property names extracted from `config.schema`. */
  readonly schemaRequiredFields: ReadonlySet<string>;
  /** All sensitive field paths (scrubbed from drafts & diagnostics). */
  readonly sensitivePaths: ReadonlySet<string>;
  /** Non-overridable built-in secret field paths. */
  readonly builtInSecretPaths: ReadonlySet<string>;
  /** Required native platform capabilities. */
  readonly requiredCapabilities: ReadonlySet<PlatformCapabilityName>;
  /** Optional native platform capabilities with graceful fallbacks. */
  readonly optionalCapabilities: ReadonlySet<PlatformCapabilityName>;
  /** Actionable compile-time diagnostics (syntax errors, cycles, unsafe regexes, missing refs). */
  readonly diagnostics: readonly ConfigSchemaIssue[];
  /** Compilation duration in milliseconds. */
  readonly compileDurationMs: number;
  /** Whether the structural graph/ASTs were reused from a cached plan via incremental recompilation. */
  readonly reusedStructure: boolean;
}
