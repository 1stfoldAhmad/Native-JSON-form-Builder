import type { FormConfig } from '../types';

/**
 * Deterministic canonical JSON serializer sorting object keys lexicographically
 * so structurally identical configs produce identical fingerprints regardless of key order.
 */
export function canonicalStableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalStableStringify(item));
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined && typeof obj[k] !== 'function')
      .sort();
    const pairs = keys.map(
      (k) => `${JSON.stringify(k)}:${canonicalStableStringify(obj[k])}`
    );
    return `{${pairs.join(',')}}`;
  }
  return 'null';
}

/**
 * Fast 64-bit-style dual FNV-1a hash encoded as compact hex string.
 */
export function fnv1aHashHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function computeConfigFingerprints(config: FormConfig): {
  fingerprint: string;
  structuralFingerprint: string;
} {
  const fullCanonical = canonicalStableStringify(config);
  const fingerprint = fnv1aHashHex(fullCanonical);

  // Strip non-structural presentation/default keys so structural graph & ASTs can be reused incrementally
  const structuralClone: Record<string, unknown> = { ...config };
  delete structuralClone.defaults;
  delete structuralClone.i18n;
  delete structuralClone.title;
  delete structuralClone.description;

  const structuralFingerprint = fnv1aHashHex(
    canonicalStableStringify(structuralClone)
  );
  return { fingerprint, structuralFingerprint };
}
