/**
 * Static ReDoS & regex complexity guardrails for untrusted/remote `form.json` schemas.
 *
 * Prevents catastrophic backtracking (e.g. `(a+)+$`, `([a-zA-Z]+)*`, `(a|aa)+$`),
 * NP-complete backreferences (`\1`, `\k<name>`), oversized patterns, excessive `{m,n}`
 * bounds, stateful flags (`g`, `y`), and unbounded input payloads.
 */

export const MAX_REGEX_PATTERN_LENGTH = 512;
export const MAX_REGEX_INPUT_LENGTH = 4_096;
export const MAX_REGEX_QUANTIFIER_BOUND = 1_000;

const ALLOWED_FLAGS = new Set(['i', 'm', 's', 'u']);
const COMPILED_CACHE_LIMIT = 256;
const compiledRegexCache = new Map<string, RegExp>();

export interface RegexSafetyAnalysis {
  safe: boolean;
  reason?: string;
  sanitizedFlags?: string;
}

export interface SafeRegexTestResult {
  matched: boolean;
  blocked: boolean;
  reason?: string;
}

interface GroupFrame {
  repetitionQuantifierCount: number;
  branches: string[];
  currentBranchStart: number;
}

/**
 * Checks whether a single-branch repeated group with exactly 1 inner quantifier has a
 * mandatory disjoint literal delimiter at its start or end (e.g. `(?:-[a-z0-9]+)*` or
 * `(?:[\w-]+\.)+`), which makes consecutive iterations unambiguous and linear-time O(n).
 */
function isSafeDisjointDelimitedGroup(branch: string, sanitizedFlags: string): boolean {
  // Pattern A: `<literal><atom>(+|*|{m,n})` e.g. `-[a-z0-9]+` or `\/[A-Za-z0-9_]+`
  const leadingMatch =
    /^(?:\\([^dDsSwWbB1-9kKpPuUx0])|([^-+*?{}()[\]\\.|^$])|(-))((?:\[[^\]\\]*(?:\\.[^\]\\]*)*\]|\\[dDsSwW]|[A-Za-z0-9]))(?:\+|\*|\{\d+(?:,\d*)?\})$/.exec(
      branch
    );
  if (leadingMatch) {
    const delim = leadingMatch[1] ?? leadingMatch[2] ?? leadingMatch[3];
    const atom = leadingMatch[4];
    try {
      return !new RegExp(`^${atom}$`, sanitizedFlags).test(delim);
    } catch {
      return false;
    }
  }

  // Pattern B: `<atom>(+|*|{m,n})<literal>` e.g. `[\w-]+\.` or `[a-z0-9]+-`
  const trailingMatch =
    /^((?:\[[^\]\\]*(?:\\.[^\]\\]*)*\]|\\[dDsSwW]|[A-Za-z0-9]))(?:\+|\*|\{\d+(?:,\d*)?\})(?:\\([^dDsSwWbB1-9kKpPuUx0])|([^-+*?{}()[\]\\.|^$])|(-))$/.exec(
      branch
    );
  if (trailingMatch) {
    const atom = trailingMatch[1];
    const delim = trailingMatch[2] ?? trailingMatch[3] ?? trailingMatch[4];
    try {
      return !new RegExp(`^${atom}$`, sanitizedFlags).test(delim);
    } catch {
      return false;
    }
  }

  return false;
}

function parseBraceQuantifier(
  pattern: string,
  openBraceIdx: number
): {
  isQuantifier: boolean;
  endIdx: number;
  min: number;
  max: number | null;
  invalidReason?: string;
} {
  const closeIdx = pattern.indexOf('}', openBraceIdx + 1);
  if (closeIdx === -1) {
    return { isQuantifier: false, endIdx: openBraceIdx, min: 0, max: 0 };
  }
  const body = pattern.slice(openBraceIdx + 1, closeIdx);
  const match = /^(\d+)(?:,(\d*))?$/.exec(body);
  if (!match) {
    return { isQuantifier: false, endIdx: openBraceIdx, min: 0, max: 0 };
  }
  const min = Number(match[1]);
  const hasComma = body.includes(',');
  const max = !hasComma ? min : match[2] === '' ? null : Number(match[2]);

  if (min > MAX_REGEX_QUANTIFIER_BOUND || (max !== null && max > MAX_REGEX_QUANTIFIER_BOUND)) {
    return {
      isQuantifier: true,
      endIdx: closeIdx,
      min,
      max,
      invalidReason: `Quantifier "{${body}}" exceeds maximum repetition bound of ${MAX_REGEX_QUANTIFIER_BOUND}.`,
    };
  }
  if (max !== null && min > max) {
    return {
      isQuantifier: true,
      endIdx: closeIdx,
      min,
      max,
      invalidReason: `Invalid quantifier range "{${body}}" where min > max.`,
    };
  }

  let endIdx = closeIdx;
  if (pattern[endIdx + 1] === '?' || pattern[endIdx + 1] === '+') {
    endIdx += 1;
  }

  return { isQuantifier: true, endIdx, min, max };
}

function extractLeadingAtomSignature(branch: string): string {
  const trimmed = branch.replace(/^\(\?:|\^\$?/g, '').trim();
  if (!trimmed) return '<EMPTY>';
  if (trimmed.startsWith('.*') || trimmed.startsWith('.+')) return '<WILDCARD>';
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    return end !== -1 ? trimmed.slice(0, end + 1) : '[';
  }
  if (trimmed.startsWith('\\') && trimmed.length >= 2) {
    return trimmed.slice(0, 2);
  }
  return trimmed[0];
}

function hasOverlappingAlternationBranches(branches: readonly string[]): boolean {
  if (branches.length < 2) return false;
  const seenSignatures = new Set<string>();
  for (const raw of branches) {
    if (raw.length === 0) {
      // Empty alternation branch inside a repeated group e.g. `(a|)+`
      return true;
    }
    const sig = extractLeadingAtomSignature(raw);
    if (sig === '<EMPTY>' || sig === '<WILDCARD>') {
      return true;
    }
    if (seenSignatures.has(sig)) {
      return true;
    }
    seenSignatures.add(sig);
  }
  return false;
}

/**
 * Statically validates a regular expression string and optional flags for syntax,
 * size bounds, stateful flags, backreferences, and ReDoS star-height / ambiguity hazards.
 */
export function analyzeRegexSafety(
  pattern: string,
  flags?: string
): RegexSafetyAnalysis {
  if (typeof pattern !== 'string') {
    return { safe: false, reason: 'Regular expression pattern must be a string.' };
  }

  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    return {
      safe: false,
      reason: `Regular expression exceeds maximum allowed length of ${MAX_REGEX_PATTERN_LENGTH} characters (received ${pattern.length}).`,
    };
  }

  let sanitizedFlags = '';
  if (flags !== undefined) {
    if (typeof flags !== 'string') {
      return { safe: false, reason: 'Regular expression flags must be a string.' };
    }
    const seen = new Set<string>();
    for (const ch of flags) {
      if (!ALLOWED_FLAGS.has(ch)) {
        return {
          safe: false,
          reason: `Unsupported or stateful regex flag "${ch}". Allowed flags: i, m, s, u.`,
        };
      }
      if (seen.has(ch)) {
        return { safe: false, reason: `Duplicate regex flag "${ch}".` };
      }
      seen.add(ch);
      sanitizedFlags += ch;
    }
  }

  // Walk pattern respecting escapes and `[...]` character classes
  const groupStack: GroupFrame[] = [];
  let inCharClass = false;
  let consecutiveWildcardRepeats = 0;
  let lastAtomWasDot = false;

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];

    if (ch === '\\') {
      const next = pattern[i + 1];
      if (next === undefined) {
        return { safe: false, reason: 'Trailing backslash in regular expression.' };
      }
      if (!inCharClass) {
        // Block backreferences (`\1`..`\9` and `\k<name>`) which enable exponential/NP-hard matching
        if (next >= '1' && next <= '9') {
          return {
            safe: false,
            reason: `Backreference "\\${next}" is disallowed in form regular expressions for ReDoS safety.`,
          };
        }
        if (next === 'k') {
          return {
            safe: false,
            reason: 'Named backreference "\\k<...>" is disallowed in form regular expressions for ReDoS safety.',
          };
        }
        lastAtomWasDot = next === 's' || next === 'S' || next === 'w' || next === 'W';
      }
      i += 1;
      continue;
    }

    if (inCharClass) {
      if (ch === ']') {
        inCharClass = false;
        lastAtomWasDot = false;
      }
      continue;
    }

    if (ch === '[') {
      inCharClass = true;
      lastAtomWasDot = false;
      continue;
    }

    if (ch === '(') {
      let headerEnd = i + 1;
      if (pattern[i + 1] === '?') {
        if (pattern.slice(i + 1, i + 4) === '?<=' || pattern.slice(i + 1, i + 4) === '?<!') {
          return {
            safe: false,
            reason: 'Lookbehind assertions are disallowed in untrusted form regular expressions.',
          };
        }
        if (pattern[i + 2] === ':' || pattern[i + 2] === '=' || pattern[i + 2] === '!') {
          headerEnd = i + 3;
        } else if (pattern[i + 2] === '<') {
          const closeAngle = pattern.indexOf('>', i + 3);
          if (closeAngle !== -1) headerEnd = closeAngle + 1;
        }
      }
      groupStack.push({
        repetitionQuantifierCount: 0,
        branches: [],
        currentBranchStart: headerEnd,
      });
      i = headerEnd - 1;
      lastAtomWasDot = false;
      continue;
    }

    if (ch === '|' && groupStack.length > 0) {
      const top = groupStack[groupStack.length - 1];
      top.branches.push(pattern.slice(top.currentBranchStart, i));
      top.currentBranchStart = i + 1;
      consecutiveWildcardRepeats = 0;
      lastAtomWasDot = false;
      continue;
    }

    if (ch === ')') {
      const closed = groupStack.pop();
      if (!closed) {
        return { safe: false, reason: 'Unmatched closing parenthesis ")" in regular expression.' };
      }
      closed.branches.push(pattern.slice(closed.currentBranchStart, i));

      // Inspect whether this group is followed by a quantifier
      const next = pattern[i + 1];
      let groupIsRepeated = false;
      let jumpTo = i;

      if (next === '+' || next === '*') {
        groupIsRepeated = true;
        jumpTo = i + 1;
        if (pattern[jumpTo + 1] === '?' || pattern[jumpTo + 1] === '+') jumpTo += 1;
      } else if (next === '?') {
        jumpTo = i + 1;
        if (pattern[jumpTo + 1] === '?') jumpTo += 1;
      } else if (next === '{') {
        const parsed = parseBraceQuantifier(pattern, i + 1);
        if (parsed.invalidReason) {
          return { safe: false, reason: parsed.invalidReason };
        }
        if (parsed.isQuantifier) {
          groupIsRepeated = parsed.max === null || parsed.max > 1;
          jumpTo = parsed.endIdx;
        }
      }

      if (groupIsRepeated) {
        if (closed.repetitionQuantifierCount > 0) {
          const safeDelimited =
            closed.repetitionQuantifierCount === 1 &&
            closed.branches.length === 1 &&
            isSafeDisjointDelimitedGroup(closed.branches[0], sanitizedFlags);
          if (!safeDelimited) {
            return {
              safe: false,
              reason:
                'Unsafe nested quantifier (star-height > 1) detected — potential catastrophic ReDoS backtracking.',
            };
          }
        }
        if (hasOverlappingAlternationBranches(closed.branches)) {
          return {
            safe: false,
            reason:
              'Unsafe repeated alternation with ambiguous/overlapping branches detected — potential ReDoS backtracking.',
          };
        }
      }

      if (groupStack.length > 0 && (closed.repetitionQuantifierCount > 0 || groupIsRepeated)) {
        groupStack[groupStack.length - 1].repetitionQuantifierCount += 1;
      }

      i = jumpTo;
      lastAtomWasDot = false;
      continue;
    }

    if (ch === '+' || ch === '*') {
      if (groupStack.length > 0) {
        groupStack[groupStack.length - 1].repetitionQuantifierCount += 1;
      }
      if (lastAtomWasDot) {
        consecutiveWildcardRepeats += 1;
        if (consecutiveWildcardRepeats >= 2) {
          return {
            safe: false,
            reason:
              'Adjacent unbounded wildcard quantifiers (e.g. ".*.*") are disallowed due to quadratic/exponential backtracking.',
          };
        }
      }
      if (pattern[i + 1] === '?' || pattern[i + 1] === '+') {
        i += 1;
      }
      lastAtomWasDot = false;
      continue;
    }

    if (ch === '{') {
      const parsed = parseBraceQuantifier(pattern, i);
      if (parsed.invalidReason) {
        return { safe: false, reason: parsed.invalidReason };
      }
      if (parsed.isQuantifier) {
        const isRepetition = parsed.max === null || parsed.max > 1;
        if (isRepetition && groupStack.length > 0) {
          groupStack[groupStack.length - 1].repetitionQuantifierCount += 1;
        }
        if (isRepetition && lastAtomWasDot) {
          consecutiveWildcardRepeats += 1;
          if (consecutiveWildcardRepeats >= 2) {
            return {
              safe: false,
              reason: 'Adjacent repeated wildcard quantifiers are disallowed.',
            };
          }
        }
        i = parsed.endIdx;
        lastAtomWasDot = false;
        continue;
      }
    }

    if (ch === '.') {
      lastAtomWasDot = true;
    } else if (ch !== '?' && ch !== '^' && ch !== '$') {
      lastAtomWasDot = false;
      consecutiveWildcardRepeats = 0;
    }
  }

  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern, sanitizedFlags);
  } catch (err) {
    return {
      safe: false,
      reason: err instanceof Error ? err.message : 'Invalid regular expression syntax.',
    };
  }

  return { safe: true, sanitizedFlags };
}

/**
 * Compiles and memoizes a verified safe `RegExp`, returning `null` if the pattern
 * violates length, syntax, or ReDoS safety policies.
 */
export function compileSafeRegex(pattern: string, flags?: string): RegExp | null {
  const analysis = analyzeRegexSafety(pattern, flags);
  if (!analysis.safe) return null;

  const cacheKey = `${analysis.sanitizedFlags ?? ''}:${pattern}`;
  const cached = compiledRegexCache.get(cacheKey);
  if (cached) return cached;

  try {
    const compiled = new RegExp(pattern, analysis.sanitizedFlags);
    if (compiledRegexCache.size >= COMPILED_CACHE_LIMIT) {
      const oldestKey = compiledRegexCache.keys().next().value;
      if (oldestKey !== undefined) compiledRegexCache.delete(oldestKey);
    }
    compiledRegexCache.set(cacheKey, compiled);
    return compiled;
  } catch {
    return null;
  }
}

/**
 * Evaluates a regex against `input` only when both pattern safety and input length
 * bounds pass. Never throws and never runs catastrophic patterns.
 */
export function safeRegexTest(
  pattern: string,
  input: string,
  flags?: string,
  maxInputLength: number = MAX_REGEX_INPUT_LENGTH
): SafeRegexTestResult {
  if (input.length > maxInputLength) {
    return {
      matched: false,
      blocked: true,
      reason: `Input length (${input.length}) exceeds maximum regex evaluation limit (${maxInputLength}).`,
    };
  }
  const analysis = analyzeRegexSafety(pattern, flags);
  if (!analysis.safe) {
    return {
      matched: false,
      blocked: true,
      reason: analysis.reason,
    };
  }
  const compiled = compileSafeRegex(pattern, flags);
  if (!compiled) {
    return {
      matched: false,
      blocked: true,
      reason: 'Regular expression compilation failed.',
    };
  }
  return {
    matched: compiled.test(input),
    blocked: false,
  };
}

export interface UnsafeSchemaPatternIssue {
  path: string;
  pattern: string;
  reason: string;
}

/**
 * Recursively inspects an embedded JSON Schema (`config.schema`) for unsafe `pattern`
 * or `patternProperties` regular expressions before AJV compiles them.
 */
export function inspectSchemaRegexPatterns(
  schema: unknown,
  basePath = 'config.schema'
): UnsafeSchemaPatternIssue[] {
  const issues: UnsafeSchemaPatternIssue[] = [];
  const visited = new Set<object>();

  const walk = (node: unknown, currentPath: string) => {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, `${currentPath}[${idx}]`));
      return;
    }

    const record = node as Record<string, unknown>;
    if (typeof record.pattern === 'string') {
      const check = analyzeRegexSafety(record.pattern, 'u');
      if (!check.safe) {
        issues.push({
          path: `${currentPath}.pattern`,
          pattern: record.pattern,
          reason: check.reason ?? 'Unsafe regular expression.',
        });
      }
    }

    if (record.patternProperties && typeof record.patternProperties === 'object') {
      for (const [propPattern, subSchema] of Object.entries(
        record.patternProperties as Record<string, unknown>
      )) {
        const check = analyzeRegexSafety(propPattern, 'u');
        if (!check.safe) {
          issues.push({
            path: `${currentPath}.patternProperties[${JSON.stringify(propPattern)}]`,
            pattern: propPattern,
            reason: check.reason ?? 'Unsafe regular expression.',
          });
        }
        walk(subSchema, `${currentPath}.patternProperties[${JSON.stringify(propPattern)}]`);
      }
    }

    for (const [key, val] of Object.entries(record)) {
      if (key === 'pattern' || key === 'patternProperties') continue;
      if (val && typeof val === 'object') {
        walk(val, `${currentPath}.${key}`);
      }
    }
  };

  walk(schema, basePath);
  return issues;
}
