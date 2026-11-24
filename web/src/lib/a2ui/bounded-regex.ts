/**
 * The Basic catalog's `regex` check, bounded.
 *
 * A surface is written by the model, and `GenericBinder` evaluates every check
 * synchronously when its component mounts. JavaScript's backtracking engine has
 * no time limit, so one catastrophic pattern (`^(a+)+$`) against a few dozen
 * characters blocks the page, and blocks it again each time the conversation is
 * reopened. This module refuses the pattern shapes that backtrack without bound
 * before any of them runs.
 *
 * Refused:
 * - a pattern over {@link MAX_PATTERN_CHARS} or a value over {@link MAX_VALUE_CHARS};
 * - a backreference (`\1`, `\k<name>`);
 * - a group repeated more than once whose body holds an unbounded quantifier or an
 *   alternation (`(a+)+`, `(a|aa)*`, `(\w+\s?){2,}`);
 * - more than {@link MAX_UNBOUNDED} unbounded quantifiers in all (`a*a*a*a*b`
 *   backtracks polynomially in their count).
 *
 * Everything else runs as the library ran it. Form patterns (`^\d{10}$`,
 * `^[A-Z]{2}-\d+$`, a simple email shape) stay well inside these limits.
 */

export const MAX_PATTERN_CHARS = 256;
export const MAX_VALUE_CHARS = 256;
export const MAX_UNBOUNDED = 3;

interface Group {
  /** The body holds an unbounded quantifier, at any depth. */
  unbounded: boolean;
  /** The body holds an alternation, at any depth. */
  alternation: boolean;
}

interface Quantifier {
  /** Characters the quantifier takes, lazy/possessive suffix included. */
  length: number;
  /** It can repeat more than once. */
  repeats: boolean;
  /** It has no upper bound. */
  unbounded: boolean;
}

/** The quantifier at `pattern[i]`, or `null` when there is none. */
function quantifierAt(pattern: string, i: number): Quantifier | null {
  const char = pattern[i];
  let quantifier: Quantifier | null = null;
  if (char === '*' || char === '+') {
    quantifier = { length: 1, repeats: true, unbounded: true };
  } else if (char === '?') {
    quantifier = { length: 1, repeats: false, unbounded: false };
  } else if (char === '{') {
    const match = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(i));
    if (!match) return null; // a literal brace
    const min = Number(match[1]);
    const max = match[2] === undefined ? min : match[3] === '' ? Infinity : Number(match[3]);
    quantifier = { length: match[0].length, repeats: max > 1, unbounded: max === Infinity };
  }
  if (quantifier && pattern[i + quantifier.length] === '?') quantifier.length += 1; // lazy
  return quantifier;
}

/** Why `pattern` may backtrack without bound, or `null` when it may run. */
export function unsafePatternReason(pattern: string): string | null {
  if (pattern.length > MAX_PATTERN_CHARS) {
    // i18n-ignore: a refusal reason for the developer console
    return `the pattern is longer than ${MAX_PATTERN_CHARS} characters`;
  }
  const stack: Group[] = [{ unbounded: false, alternation: false }];
  let unboundedCount = 0;
  let i = 0;
  const countUnbounded = (q: Quantifier): string | null => {
    if (!q.unbounded) return null;
    stack[stack.length - 1].unbounded = true;
    unboundedCount += 1;
    return unboundedCount > MAX_UNBOUNDED
      ? // i18n-ignore: a refusal reason for the developer console
        `the pattern has more than ${MAX_UNBOUNDED} unbounded quantifiers`
      : null;
  };
  while (i < pattern.length) {
    const char = pattern[i];
    let atomEnd = i + 1;
    if (char === '\\') {
      const next = pattern[i + 1] ?? '';
      if (/[1-9]/.test(next) || (next === 'k' && pattern[i + 2] === '<')) {
        return 'the pattern has a backreference';
      }
      atomEnd = i + 2;
    } else if (char === '[') {
      // A character class is one atom; skip to its closing bracket.
      let j = i + 1;
      if (pattern[j] === '^') j += 1;
      if (pattern[j] === ']') j += 1;
      while (j < pattern.length && pattern[j] !== ']') j += pattern[j] === '\\' ? 2 : 1;
      atomEnd = j + 1;
    } else if (char === '(') {
      stack.push({ unbounded: false, alternation: false });
      i += 1;
      continue;
    } else if (char === ')') {
      const group = stack.length > 1 ? stack.pop()! : { unbounded: false, alternation: false };
      const q = quantifierAt(pattern, i + 1);
      if (q?.repeats && (group.unbounded || group.alternation)) {
        return 'the pattern repeats a group that can match in more than one way';
      }
      const parent = stack[stack.length - 1];
      parent.unbounded ||= group.unbounded;
      parent.alternation ||= group.alternation;
      if (q) {
        const reason = countUnbounded(q);
        if (reason) return reason;
      }
      i += 1 + (q?.length ?? 0);
      continue;
    } else if (char === '|') {
      stack[stack.length - 1].alternation = true;
      i += 1;
      continue;
    }
    const q = quantifierAt(pattern, atomEnd);
    if (q) {
      const reason = countUnbounded(q);
      if (reason) return reason;
    }
    i = atomEnd + (q?.length ?? 0);
  }
  return null;
}

/**
 * Whether `value` matches `pattern`, or a refusal reason when the pattern or
 * value is outside the bounds. Throws `SyntaxError` for an invalid pattern.
 */
export function boundedRegexTest(
  pattern: string,
  value: string,
): { ok: true; matches: boolean } | { ok: false; reason: string } {
  const reason =
    value.length > MAX_VALUE_CHARS
      ? // i18n-ignore: a refusal reason for the developer console
        `the value is longer than ${MAX_VALUE_CHARS} characters`
      : unsafePatternReason(pattern);
  if (reason) return { ok: false, reason };
  return { ok: true, matches: new RegExp(pattern).test(value) };
}
