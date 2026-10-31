import type { FormValues } from '../types';
import { getByPath } from '../utils/deepPath';

export type DependencyEdgeKind =
  | 'visibility'
  | 'enabled'
  | 'readOnly'
  | 'required'
  | 'formula'
  | 'defaultFormula'
  | 'dataSource'
  | 'validation'
  | 'stepVisibility';

export interface DependencyEdge {
  /** Source field path read by `to` (e.g. 'vehicleType', 'items.*.qty', 'items'). */
  from: string;
  /** Dependent target path affected when `from` changes (e.g. 'totalFee', 'items.*.lineTotal'). */
  to: string;
  kind: DependencyEdgeKind;
  /** Automatically clear/reset `to` when `from` mutates (used by cascading data sources). */
  resetOnChange?: boolean;
}

export interface DependencyEvaluationPlan {
  /** All concrete field/step paths affected directly or transitively by `changedPaths`. */
  affectedFields: string[];
  /** Concrete formula/calculated field paths to recompute in strict topological order. */
  formulasToEvaluate: string[];
  /** Concrete field paths whose selected values/caches should reset due to parent change. */
  dataSourcesToReset: string[];
  /** Concrete field paths whose cross-field or dependent validations should re-evaluate. */
  validationsToReRun: string[];
}

export interface DependencyGraphSnapshot {
  nodeCount: number;
  edgeCount: number;
  formulaNodes: string[];
  edges: Array<{
    from: string;
    to: string;
    kinds: DependencyEdgeKind[];
    resetOnChange: boolean;
  }>;
  cycles: string[][];
}

/**
 * Converts a concrete indexed path like `items.2.sub.0.qty` into its wildcard template
 * `items.*.sub.*.qty` so repeater dependencies match in O(depth) time.
 */
export function toWildcardTemplatePath(concretePath: string): string {
  if (!concretePath.includes('.')) return concretePath;
  return concretePath
    .split('.')
    .map((seg) => (/^\d+$/.test(seg) ? '*' : seg))
    .join('.');
}

/**
 * Extracts numeric repeater indices from a concrete path (e.g. `items.2.tasks.1.hours` -> `[2, 1]`).
 */
function extractNumericIndices(concretePath: string): number[] {
  const out: number[] = [];
  for (const seg of concretePath.split('.')) {
    if (/^\d+$/.test(seg)) {
      out.push(Number(seg));
    }
  }
  return out;
}

/**
 * Expands a wildcard target template path (e.g. `items.*.lineTotal`) into concrete paths:
 * - If `sourceConcretePath` shares repeater indices with `targetTemplate`, binds the matching
 *   row index directly (`items.2.lineTotal`) so sibling rows are NOT recomputed!
 * - Otherwise (e.g. top-level `taxRate` changed), expands across active array elements in `values`.
 */
export function expandTargetTemplatePaths(
  targetTemplate: string,
  sourceConcretePath: string,
  values: FormValues
): string[] {
  if (!targetTemplate.includes('*')) {
    return [targetTemplate];
  }

  const targetSegs = targetTemplate.split('.');
  const sourceSegs = sourceConcretePath.split('.');
  const sourceIndices = extractNumericIndices(sourceConcretePath);

  // Check if `sourceConcretePath` shares the leading repeater array prefix with `targetTemplate`
  const firstWildcardIdx = targetSegs.indexOf('*');
  const sharedArrayPrefix =
    firstWildcardIdx > 0 &&
    sourceSegs.length > firstWildcardIdx &&
    targetSegs.slice(0, firstWildcardIdx).join('.') ===
      sourceSegs.slice(0, firstWildcardIdx).join('.') &&
    /^\d+$/.test(sourceSegs[firstWildcardIdx]);

  if (sharedArrayPrefix && sourceIndices.length > 0) {
    let wildcardCursor = 0;
    const bound = targetSegs.map((seg) => {
      if (seg === '*' && wildcardCursor < sourceIndices.length) {
        const idx = sourceIndices[wildcardCursor];
        wildcardCursor += 1;
        return String(idx);
      }
      return seg;
    });
    if (!bound.includes('*')) {
      return [bound.join('.')];
    }
  }

  // Expand remaining `*` segments against actual array lengths in `values`
  const expandRecursive = (segs: string[], pos: number, prefix: string): string[] => {
    if (pos >= segs.length) return [prefix];
    const seg = segs[pos];
    if (seg === '*') {
      const arr = prefix ? getByPath(values, prefix) : undefined;
      if (!Array.isArray(arr) || arr.length === 0) return [];
      const results: string[] = [];
      for (let i = 0; i < arr.length; i += 1) {
        const nextPrefix = prefix ? `${prefix}.${i}` : String(i);
        results.push(...expandRecursive(segs, pos + 1, nextPrefix));
      }
      return results;
    }
    const nextPrefix = prefix ? `${prefix}.${seg}` : seg;
    return expandRecursive(segs, pos + 1, nextPrefix);
  };

  return expandRecursive(targetSegs, 0, '');
}

/**
 * Reactive directed dependency graph maintaining forward & reverse field indexes,
 * repeater wildcard bindings, cycle detection, and incremental topological evaluation plans.
 */
export class DependencyGraph {
  private forward = new Map<string, Map<string, Set<DependencyEdgeKind>>>();
  private reverse = new Map<string, Map<string, Set<DependencyEdgeKind>>>();
  private resetPairs = new Map<string, Set<string>>();
  private formulaNodes = new Set<string>();
  private registrationOrder = new Map<string, number>();
  private nextOrder = 0;

  private touchNode(node: string): void {
    if (!this.registrationOrder.has(node)) {
      this.registrationOrder.set(node, this.nextOrder++);
    }
  }

  public markFormulaNode(templatePath: string): void {
    this.touchNode(templatePath);
    this.formulaNodes.add(templatePath);
  }

  public isFormulaNode(templateOrConcretePath: string): boolean {
    return (
      this.formulaNodes.has(templateOrConcretePath) ||
      this.formulaNodes.has(toWildcardTemplatePath(templateOrConcretePath))
    );
  }

  public addEdge(edge: DependencyEdge): void {
    if (!edge.from || !edge.to) return;
    this.touchNode(edge.from);
    this.touchNode(edge.to);

    if (!this.forward.has(edge.from)) {
      this.forward.set(edge.from, new Map());
    }
    const fwdTargets = this.forward.get(edge.from)!;
    if (!fwdTargets.has(edge.to)) {
      fwdTargets.set(edge.to, new Set());
    }
    fwdTargets.get(edge.to)!.add(edge.kind);

    if (!this.reverse.has(edge.to)) {
      this.reverse.set(edge.to, new Map());
    }
    const revSources = this.reverse.get(edge.to)!;
    if (!revSources.has(edge.from)) {
      revSources.set(edge.from, new Set());
    }
    revSources.get(edge.from)!.add(edge.kind);

    if (edge.kind === 'formula') {
      this.formulaNodes.add(edge.to);
    }

    if (edge.resetOnChange) {
      if (!this.resetPairs.has(edge.from)) {
        this.resetPairs.set(edge.from, new Set());
      }
      this.resetPairs.get(edge.from)!.add(edge.to);
    }
  }

  public registerDependencies(
    targetPath: string,
    sourcePaths: Iterable<string>,
    kind: DependencyEdgeKind,
    options?: { resetOnChange?: boolean }
  ): void {
    for (const src of sourcePaths) {
      this.addEdge({
        from: src,
        to: targetPath,
        kind,
        resetOnChange: options?.resetOnChange,
      });
    }
  }

  public removeNode(node: string): void {
    const outgoing = this.forward.get(node);
    if (outgoing) {
      for (const target of outgoing.keys()) {
        this.reverse.get(target)?.delete(node);
      }
      this.forward.delete(node);
    }

    const incoming = this.reverse.get(node);
    if (incoming) {
      for (const source of incoming.keys()) {
        this.forward.get(source)?.delete(node);
        this.resetPairs.get(source)?.delete(node);
      }
      this.reverse.delete(node);
    }

    this.resetPairs.delete(node);
    this.formulaNodes.delete(node);
    this.registrationOrder.delete(node);
  }

  public getDirectDependents(
    sourcePath: string,
    kinds?: ReadonlySet<DependencyEdgeKind>
  ): Set<string> {
    const out = new Set<string>();
    const collectFromKey = (key: string) => {
      const targets = this.forward.get(key);
      if (!targets) return;
      for (const [target, edgeKinds] of targets.entries()) {
        if (!kinds) {
          out.add(target);
        } else {
          for (const k of edgeKinds) {
            if (kinds.has(k)) {
              out.add(target);
              break;
            }
          }
        }
      }
    };

    collectFromKey(sourcePath);
    const wildcardKey = toWildcardTemplatePath(sourcePath);
    if (wildcardKey !== sourcePath) {
      collectFromKey(wildcardKey);
    }
    return out;
  }

  public getDirectDependencies(
    targetPath: string,
    kinds?: ReadonlySet<DependencyEdgeKind>
  ): Set<string> {
    const out = new Set<string>();
    const collectFromKey = (key: string) => {
      const sources = this.reverse.get(key);
      if (!sources) return;
      for (const [src, edgeKinds] of sources.entries()) {
        if (!kinds) {
          out.add(src);
        } else {
          for (const k of edgeKinds) {
            if (kinds.has(k)) {
              out.add(src);
              break;
            }
          }
        }
      }
    };

    collectFromKey(targetPath);
    const wildcardKey = toWildcardTemplatePath(targetPath);
    if (wildcardKey !== targetPath) {
      collectFromKey(wildcardKey);
    }
    return out;
  }

  /**
   * Detects all directed cycles across `onlyKinds` (or all edges if omitted) using
   * Tarjan's Strongly Connected Components algorithm + explicit self-loop checks.
   */
  public detectCycles(onlyKinds?: ReadonlySet<DependencyEdgeKind>): string[][] {
    const nodes = Array.from(this.registrationOrder.keys());
    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];

    const hasMatchingEdge = (u: string, v: string): boolean => {
      const kinds = this.forward.get(u)?.get(v);
      if (!kinds) return false;
      if (!onlyKinds) return true;
      for (const k of kinds) {
        if (onlyKinds.has(k)) return true;
      }
      return false;
    };

    const getNeighbors = (u: string): string[] => {
      const targets = this.forward.get(u);
      if (!targets) return [];
      const res: string[] = [];
      for (const [v, kinds] of targets.entries()) {
        if (!onlyKinds) {
          res.push(v);
        } else {
          for (const k of kinds) {
            if (onlyKinds.has(k)) {
              res.push(v);
              break;
            }
          }
        }
      }
      return res;
    };

    const strongConnect = (v: string) => {
      indices.set(v, index);
      lowlink.set(v, index);
      index += 1;
      stack.push(v);
      onStack.add(v);

      for (const w of getNeighbors(v)) {
        if (!indices.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }

      if (lowlink.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);

        if (scc.length > 1) {
          scc.reverse();
          cycles.push([...scc, scc[0]]);
        } else if (scc.length === 1 && hasMatchingEdge(scc[0], scc[0])) {
          cycles.push([scc[0], scc[0]]);
        }
      }
    };

    for (const node of nodes) {
      if (!indices.has(node)) {
        strongConnect(node);
      }
    }

    return cycles;
  }

  public detectFormulaCycles(): string[][] {
    return this.detectCycles(new Set<DependencyEdgeKind>(['formula']));
  }

  /**
   * Computes deterministic topological evaluation order across all non-cyclic formula nodes.
   */
  public getTopologicalFormulaOrder(): string[] {
    const formulaSet = new Set(this.formulaNodes);
    if (formulaSet.size === 0) return [];

    const cyclicNodes = new Set<string>();
    for (const cycle of this.detectFormulaCycles()) {
      for (const n of cycle) cyclicNodes.add(n);
    }

    const active = Array.from(formulaSet).filter((n) => !cyclicNodes.has(n));
    const activeSet = new Set(active);
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const n of active) {
      inDegree.set(n, 0);
      adj.set(n, []);
    }

    for (const u of active) {
      const targets = this.forward.get(u);
      if (!targets) continue;
      for (const [v, kinds] of targets.entries()) {
        if (activeSet.has(v) && kinds.has('formula')) {
          adj.get(u)!.push(v);
          inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
        }
      }
    }

    const sortByOrder = (list: string[]) =>
      list.sort(
        (a, b) =>
          (this.registrationOrder.get(a) ?? 0) - (this.registrationOrder.get(b) ?? 0)
      );

    const queue = sortByOrder(active.filter((n) => (inDegree.get(n) ?? 0) === 0));
    const ordered: string[] = [];

    while (queue.length > 0) {
      const u = queue.shift()!;
      ordered.push(u);
      for (const v of adj.get(u) ?? []) {
        const nextDeg = (inDegree.get(v) ?? 1) - 1;
        inDegree.set(v, nextDeg);
        if (nextDeg === 0) {
          queue.push(v);
          sortByOrder(queue);
        }
      }
    }

    return ordered;
  }

  /**
   * Given one or more concrete mutated paths, computes the minimal affected subgraph
   * and returns concrete reset targets, topologically ordered formula paths, validation
   * dependents, and subscriber notification paths. Unrelated fields are never visited.
   */
  public getEvaluationPlan(
    changedPaths: readonly string[],
    values: FormValues
  ): DependencyEvaluationPlan {
    const cyclicFormulas = new Set<string>();
    for (const c of this.detectFormulaCycles()) {
      for (const n of c) cyclicFormulas.add(n);
    }

    const affectedSet = new Set<string>();
    const formulaCandidates = new Map<string, string>(); // concretePath -> templatePath
    const resetSet = new Set<string>();
    const validationSet = new Set<string>();

    const queue: string[] = [...changedPaths];
    const visitedSources = new Set<string>();

    // Also include wildcard array children if an array path itself (e.g. 'items') mutated
    for (const p of changedPaths) {
      const maybeArr = getByPath(values, p);
      if (Array.isArray(maybeArr)) {
        for (const key of this.forward.keys()) {
          if (key.startsWith(`${p}.*.`)) {
            for (let i = 0; i < maybeArr.length; i += 1) {
              queue.push(key.replace(`${p}.*.`, `${p}.${i}.`));
            }
            // Even when array becomes empty (length 0), propagate wildcard key so SUM(items.*.x) -> 0!
            queue.push(key);
          }
        }
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visitedSources.has(current)) continue;
      visitedSources.add(current);

      const lookupKeys = [current];
      const wildcard = toWildcardTemplatePath(current);
      if (wildcard !== current) lookupKeys.push(wildcard);

      for (const key of lookupKeys) {
        // 1. Cascading data-source resets
        const resets = this.resetPairs.get(key);
        if (resets) {
          for (const targetTpl of resets) {
            for (const concreteTarget of expandTargetTemplatePaths(
              targetTpl,
              current,
              values
            )) {
              if (!resetSet.has(concreteTarget)) {
                resetSet.add(concreteTarget);
                affectedSet.add(concreteTarget);
                queue.push(concreteTarget);
              }
            }
          }
        }

        // 2. Forward edges by kind
        const targets = this.forward.get(key);
        if (!targets) continue;

        for (const [targetTpl, kinds] of targets.entries()) {
          const concreteTargets = expandTargetTemplatePaths(targetTpl, current, values);
          for (const concreteTarget of concreteTargets) {
            affectedSet.add(concreteTarget);

            if (kinds.has('validation') || kinds.has('required')) {
              validationSet.add(concreteTarget);
            }

            if (kinds.has('formula') && !cyclicFormulas.has(targetTpl)) {
              formulaCandidates.set(concreteTarget, targetTpl);
              queue.push(concreteTarget);
            } else if (kinds.has('dataSource')) {
              queue.push(concreteTarget);
            }
          }
        }
      }
    }

    // Order `formulaCandidates` according to topological rank of their template nodes
    const topoTemplates = this.getTopologicalFormulaOrder();
    const templateRank = new Map<string, number>();
    topoTemplates.forEach((tpl, idx) => templateRank.set(tpl, idx));

    const formulasToEvaluate = Array.from(formulaCandidates.entries())
      .sort(([concreteA, tplA], [concreteB, tplB]) => {
        const rankDiff =
          (templateRank.get(tplA) ?? Number.MAX_SAFE_INTEGER) -
          (templateRank.get(tplB) ?? Number.MAX_SAFE_INTEGER);
        if (rankDiff !== 0) return rankDiff;
        return concreteA.localeCompare(concreteB);
      })
      .map(([concrete]) => concrete);

    return {
      affectedFields: Array.from(affectedSet),
      formulasToEvaluate,
      dataSourcesToReset: Array.from(resetSet),
      validationsToReRun: Array.from(validationSet),
    };
  }

  public toDebugSnapshot(): DependencyGraphSnapshot {
    const edges: DependencyGraphSnapshot['edges'] = [];
    for (const [from, targets] of this.forward.entries()) {
      for (const [to, kinds] of targets.entries()) {
        edges.push({
          from,
          to,
          kinds: Array.from(kinds),
          resetOnChange: Boolean(this.resetPairs.get(from)?.has(to)),
        });
      }
    }
    return {
      nodeCount: this.registrationOrder.size,
      edgeCount: edges.length,
      formulaNodes: Array.from(this.formulaNodes),
      edges,
      cycles: this.detectCycles(),
    };
  }
}
