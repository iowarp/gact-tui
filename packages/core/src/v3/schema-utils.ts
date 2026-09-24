import { z } from 'zod';

export function forwardCompatibleEnum<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return z
    .enum([...values, 'unknown'] as [Values[number] | 'unknown', ...(Values[number] | 'unknown')[]])
    .catch('unknown');
}

/**
 * An optional wire string that may arrive as `null`.
 *
 * Python services serialise an unset `str | None` as `null`, while
 * `z.string().optional()` only accepts an absent key — so a single `null`
 * rejected the whole payload (the ALCF sign-in "expected string, received
 * null" error). Readers accept both and normalise to `undefined`.
 */
export function optionalWireString() {
  return z
    .string()
    .nullish()
    .transform((value) => value ?? undefined);
}
