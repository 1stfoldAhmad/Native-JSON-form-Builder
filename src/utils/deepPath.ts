/**
 * Deep dot-path helpers for nested `objectGroup`, `arrayGroup`, and `repeater` values.
 * Includes prototype-pollution guards for untrusted/remote `form.json` configurations.
 */

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function isUnsafePathSegment(segment: string): boolean {
  return UNSAFE_PATH_SEGMENTS.has(segment);
}

export function hasUnsafePathSegment(path: string | undefined): boolean {
  if (!path) return false;
  if (UNSAFE_PATH_SEGMENTS.has(path)) return true;
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .some((seg) => UNSAFE_PATH_SEGMENTS.has(seg));
}

export function splitPath(path: string): string[] {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  if (segments.some((seg) => UNSAFE_PATH_SEGMENTS.has(seg))) {
    return [];
  }
  return segments;
}

export function getByPath(source: unknown, path: string | undefined): unknown {
  if (!path || source == null || typeof source !== 'object') return undefined;
  if (hasUnsafePathSegment(path)) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) {
    return (source as Record<string, unknown>)[path];
  }
  const segments = splitPath(path);
  if (segments.length === 0) return undefined;
  let cursor: unknown = source;
  for (const key of segments) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, key)) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

export function setByPath<T extends Record<string, unknown>>(
  target: T,
  path: string,
  value: unknown
): T {
  if (hasUnsafePathSegment(path)) return target;
  const segments = splitPath(path);
  if (segments.length === 0) return target;
  if (segments.length === 1) {
    const out: Record<string, unknown> = { ...target };
    Object.defineProperty(out, segments[0], {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    return out as T;
  }

  const clone: Record<string, unknown> = Array.isArray(target)
    ? ([...target] as unknown as Record<string, unknown>)
    : { ...target };

  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const nextKey = segments[i + 1];
    const nextIsIndex = /^\d+$/.test(nextKey);
    const existing = Object.prototype.hasOwnProperty.call(cursor, key)
      ? cursor[key]
      : undefined;

    let nextContainer: unknown;
    if (Array.isArray(existing)) {
      nextContainer = [...existing];
    } else if (existing != null && typeof existing === 'object') {
      nextContainer = { ...(existing as Record<string, unknown>) };
    } else {
      nextContainer = nextIsIndex ? [] : {};
    }

    cursor[key] = nextContainer;
    cursor = nextContainer as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1]] = value;
  return clone as T;
}

export function deleteByPath<T extends Record<string, unknown>>(
  target: T,
  path: string
): T {
  if (!path || hasUnsafePathSegment(path)) return target;
  const segments = splitPath(path);
  if (segments.length === 0) return target;

  if (segments.length === 1) {
    if (!Object.prototype.hasOwnProperty.call(target, segments[0])) {
      return target;
    }
    const clone: Record<string, unknown> = { ...target };
    delete clone[segments[0]];
    return clone as T;
  }

  if (getByPath(target, path) === undefined) {
    return target;
  }

  const clone: Record<string, unknown> = Array.isArray(target)
    ? ([...target] as unknown as Record<string, unknown>)
    : { ...target };

  let cursor: Record<string, unknown> = clone;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = cursor[key];
    if (existing == null || typeof existing !== 'object') {
      return target;
    }
    const nextContainer = Array.isArray(existing)
      ? [...existing]
      : { ...(existing as Record<string, unknown>) };
    cursor[key] = nextContainer;
    cursor = nextContainer as Record<string, unknown>;
  }

  const leaf = segments[segments.length - 1];
  if (Array.isArray(cursor) && /^\d+$/.test(leaf)) {
    cursor.splice(Number(leaf), 1);
  } else {
    delete cursor[leaf];
  }
  return clone as T;
}

export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (UNSAFE_PATH_SEGMENTS.has(k)) continue;
    out[k] = deepClone(v);
  }
  return out as T;
}
