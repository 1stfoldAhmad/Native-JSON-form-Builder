/**
 * Hierarchical path subscription index providing `O(depth + affectedListeners)`
 * notifications for exact paths, ancestor object/array paths, and descendant sub-paths
 * without scanning unrelated subscribed field paths.
 */
export class PathSubscriptionIndex {
  private readonly exactListeners = new Map<string, Set<() => void>>();
  /**
   * Maps each dot-prefix (`"address"`, `"address.billing"`) to the set of
   * currently subscribed descendant paths (`"address.billing.city"`).
   */
  private readonly descendantPathsByPrefix = new Map<string, Set<string>>();

  private static extractAncestorPrefixes(path: string): string[] {
    const prefixes: string[] = [];
    let dotIdx = path.indexOf('.');
    while (dotIdx !== -1) {
      prefixes.push(path.slice(0, dotIdx));
      dotIdx = path.indexOf('.', dotIdx + 1);
    }
    return prefixes;
  }

  public subscribe(paths: readonly string[], listener: () => void): () => void {
    const uniquePaths = Array.from(new Set(paths));

    for (const p of uniquePaths) {
      let bucket = this.exactListeners.get(p);
      if (!bucket) {
        bucket = new Set();
        this.exactListeners.set(p, bucket);
        for (const prefix of PathSubscriptionIndex.extractAncestorPrefixes(p)) {
          let descSet = this.descendantPathsByPrefix.get(prefix);
          if (!descSet) {
            descSet = new Set();
            this.descendantPathsByPrefix.set(prefix, descSet);
          }
          descSet.add(p);
        }
      }
      bucket.add(listener);
    }

    return () => {
      for (const p of uniquePaths) {
        const bucket = this.exactListeners.get(p);
        if (!bucket) continue;
        bucket.delete(listener);
        if (bucket.size === 0) {
          this.exactListeners.delete(p);
          for (const prefix of PathSubscriptionIndex.extractAncestorPrefixes(p)) {
            const descSet = this.descendantPathsByPrefix.get(prefix);
            if (descSet) {
              descSet.delete(p);
              if (descSet.size === 0) {
                this.descendantPathsByPrefix.delete(prefix);
              }
            }
          }
        }
      }
    };
  }

  /**
   * Collects listeners subscribed to `exactPath` only (`O(1)`).
   */
  public collectExact(exactPath: string, target: Set<() => void>): number {
    const direct = this.exactListeners.get(exactPath);
    if (!direct) return 1;
    for (const fn of direct) target.add(fn);
    return 1;
  }

  /**
   * Collects listeners for:
   * 1. `changedPath` itself (`O(1)`)
   * 2. Ancestor paths (`"a"`, `"a.b"` when `"a.b.c"` changes — `O(depth)`)
   * 3. Subscribed descendant paths (`"a.b.c"` when `"a"` changes — `O(matchingDescendants)`)
   *
   * Returns the number of path buckets inspected (independent of total subscribed fields).
   */
  public collectHierarchy(changedPath: string, target: Set<() => void>): number {
    let bucketsInspected = 0;

    // 1. Exact path
    bucketsInspected += 1;
    const direct = this.exactListeners.get(changedPath);
    if (direct) {
      for (const fn of direct) target.add(fn);
    }

    // 2. Ancestors (`O(depth)`)
    let dotIdx = changedPath.indexOf('.');
    while (dotIdx !== -1) {
      const ancestor = changedPath.slice(0, dotIdx);
      bucketsInspected += 1;
      const ancBucket = this.exactListeners.get(ancestor);
      if (ancBucket) {
        for (const fn of ancBucket) target.add(fn);
      }
      dotIdx = changedPath.indexOf('.', dotIdx + 1);
    }

    // 3. Descendants (`O(matchingDescendants)`)
    const descendants = this.descendantPathsByPrefix.get(changedPath);
    if (descendants) {
      for (const descPath of descendants) {
        bucketsInspected += 1;
        const descBucket = this.exactListeners.get(descPath);
        if (descBucket) {
          for (const fn of descBucket) target.add(fn);
        }
      }
    }

    return bucketsInspected;
  }

  public collectAll(target: Set<() => void>): void {
    for (const bucket of this.exactListeners.values()) {
      for (const fn of bucket) {
        target.add(fn);
      }
    }
  }

  public getStats(): { subscribedPathCount: number; prefixBucketCount: number } {
    return {
      subscribedPathCount: this.exactListeners.size,
      prefixBucketCount: this.descendantPathsByPrefix.size,
    };
  }
}
