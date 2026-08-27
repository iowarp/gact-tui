import { z } from 'zod';

export function forwardCompatibleEnum<const Values extends readonly [string, ...string[]]>(
  values: Values,
) {
  return z
    .enum([...values, 'unknown'] as [Values[number] | 'unknown', ...(Values[number] | 'unknown')[]])
    .catch('unknown');
}
