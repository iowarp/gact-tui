import { z } from 'zod';

/**
 * A strict `ZodObject` that also runs `refine` as a cross-field business rule
 * (an "exactly one of X or dataUri" shape, for instance), while remaining an
 * actual `ZodObject` instance — its `.shape` intact — so the generic A2UI
 * binder's schema-behavior scraper still discovers every
 * `DynamicString`/`DynamicValue` property on it.
 *
 * `.superRefine()` alone returns a `ZodEffects` wrapper, which hides every
 * binding on the component from that scraper (`a2ui-chart-catalog.ts` found
 * this first, for `selection`); this keeps the exported schema a plain
 * `ZodObject` for the binder, and parses through a refined twin built from
 * the same shape.
 */
export function refinedStrictObject<Shape extends z.ZodRawShape>(
  shape: Shape,
  refine: (
    value: z.infer<z.ZodObject<Shape, 'strict'>>,
    context: z.RefinementCtx,
  ) => void,
): z.ZodObject<Shape, 'strict'> {
  const plain = z.object(shape).strict();
  const refined = z.object(shape).strict().superRefine(refine);
  Object.defineProperty(plain, '_parse', {
    value: (input: z.ParseInput) => refined._parse(input),
  });
  return plain;
}
