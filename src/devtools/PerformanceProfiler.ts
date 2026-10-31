export type ProfilerMetricCategory =
  | 'compile'
  | 'propagation'
  | 'formula'
  | 'validation'
  | 'dataSource'
  | 'render';

export interface ProfilerMetricSummary {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number;
}

export interface PerformanceProfileReport {
  enabled: boolean;
  metrics: Record<ProfilerMetricCategory, ProfilerMetricSummary>;
  fieldRenderCounts: Record<string, number>;
}

function emptyMetric(): ProfilerMetricSummary {
  return { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
}

/**
 * Opt-in performance profiler with zero overhead when `enabled === false` (default).
 */
export class PerformanceProfiler {
  private enabled: boolean;
  private readonly metrics: Record<ProfilerMetricCategory, ProfilerMetricSummary> = {
    compile: emptyMetric(),
    propagation: emptyMetric(),
    formula: emptyMetric(),
    validation: emptyMetric(),
    dataSource: emptyMetric(),
    render: emptyMetric(),
  };
  private readonly fieldRenderCounts = new Map<string, number>();

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(next: boolean): void {
    this.enabled = next;
  }

  measure<T>(category: ProfilerMetricCategory, fn: () => T): T {
    if (!this.enabled) return fn();
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      return fn();
    } finally {
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.recordDuration(category, Math.max(0, end - start));
    }
  }

  async measureAsync<T>(
    category: ProfilerMetricCategory,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.enabled) return fn();
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      return await fn();
    } finally {
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.recordDuration(category, Math.max(0, end - start));
    }
  }

  recordDuration(category: ProfilerMetricCategory, durationMs: number): void {
    if (!this.enabled) return;
    const summary = this.metrics[category];
    summary.count += 1;
    summary.totalMs += durationMs;
    if (durationMs > summary.maxMs) summary.maxMs = durationMs;
    summary.lastMs = durationMs;
  }

  recordFieldRender(fieldPath: string): void {
    if (!this.enabled) return;
    this.fieldRenderCounts.set(
      fieldPath,
      (this.fieldRenderCounts.get(fieldPath) ?? 0) + 1
    );
  }

  reset(): void {
    for (const key of Object.keys(this.metrics) as ProfilerMetricCategory[]) {
      this.metrics[key] = emptyMetric();
    }
    this.fieldRenderCounts.clear();
  }

  getReport(): PerformanceProfileReport {
    return {
      enabled: this.enabled,
      metrics: {
        compile: { ...this.metrics.compile },
        propagation: { ...this.metrics.propagation },
        formula: { ...this.metrics.formula },
        validation: { ...this.metrics.validation },
        dataSource: { ...this.metrics.dataSource },
        render: { ...this.metrics.render },
      },
      fieldRenderCounts: Object.fromEntries(this.fieldRenderCounts.entries()),
    };
  }
}
