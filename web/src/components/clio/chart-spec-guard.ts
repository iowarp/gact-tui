import guardRules from './chart-assets/guard_rules.json';

/**
 * TypeScript mirror of the `clio.chart.v1` spec guard
 * (`clio_schemas.a2ui.chart_spec.check_chart_spec`, clio-schemas 0.5.0).
 *
 * Every limit comes from `chart-assets/guard_rules.json`, a byte copy of
 * `schemas/a2ui/chart/guard_rules.json`; the shared fixtures in
 * `test-fixtures/chart/guard_cases.json` pin this port to the Python one.
 * A spec that fails is never handed to Vega — the chart states why instead.
 */

/** The rules version this port implements; the Python side bumps it when a rule changes meaning. */
export const CHART_SPEC_RULES_SUPPORTED_VERSION = 1;

export const CHART_SPEC_RULES = guardRules;

export type ChartSpecViolationCode =
  | 'spec_not_object'
  | 'spec_too_deep'
  | 'spec_too_large'
  | 'top_level_key_not_allowed'
  | 'too_many_views'
  | 'data_not_named_source'
  | 'forbidden_key'
  // Client-only addition ahead of the shared `guard_rules.json` (#1533 #506
  // LOW) — not yet in the Python guard's `errorCodes`; reported upstream so
  // the schema/server guard picks up the same rule.
  | 'forbidden_bind_element';

/** One guard failure: a stable code, a JSON Pointer to the offending node, and a message. */
export interface ChartSpecViolation {
  code: ChartSpecViolationCode;
  path: string;
  message: string;
}

type JsonObject = Record<string, unknown>;

const ALLOWED_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(guardRules.allowedTopLevelKeys);
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(guardRules.forbiddenKeys);
const COMPOSITION_ARRAY_KEYS: readonly string[] = guardRules.compositionArrayKeys;
/** The one dataset name a spec may read; the renderer binds the component's rows to it. */
export const DATA_SOURCE_NAME = guardRules.requiredDataObject.name;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pointer(parent: string, token: string | number): string {
  return `${parent}/${String(token).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

/** Deepest object/array nesting (a scalar is 0, `{}` is 1); iterative, so any input is safe. */
export function specDepth(spec: unknown): number {
  let deepest = 0;
  const stack: Array<[unknown, number]> = [[spec, 1]];
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    let children: unknown[];
    if (Array.isArray(node)) children = node;
    else if (isJsonObject(node)) children = Object.values(node);
    else continue;
    deepest = Math.max(deepest, depth);
    for (const child of children) stack.push([child, depth + 1]);
  }
  return deepest;
}

/** UTF-8 byte length of the compact `JSON.stringify` serialisation (the `maxSpecBytes` measure). */
export function serializedSize(spec: unknown): number {
  return new TextEncoder().encode(JSON.stringify(spec)).length;
}

/** Views in a Vega-Lite spec, counted as `guard_rules.json#viewCounting` states. */
export function countViews(spec: unknown): number {
  let views = 0;
  const stack: unknown[] = [spec];
  while (stack.length) {
    const node = stack.pop();
    if (!isJsonObject(node)) continue;
    const composed = COMPOSITION_ARRAY_KEYS.map((key) => node[key]).filter(Array.isArray);
    if (composed.length) {
      for (const children of composed) stack.push(...(children as unknown[]));
    } else if (('facet' in node || 'repeat' in node) && isJsonObject(node.spec)) {
      stack.push(node.spec);
    } else if ('mark' in node) {
      views += 1;
    }
  }
  return views;
}

function isNamedSource(value: unknown): boolean {
  return isJsonObject(value) && Object.keys(value).length === 1 && value.name === DATA_SOURCE_NAME;
}

/**
 * No `element` key inside any `bind` object, at any depth — Vega's own
 * signal-binding escape hatch to mount an input widget into an arbitrary
 * element by CSS selector, anywhere on the host page, not just inside the
 * chart's own container.
 *
 * `guard_rules.json` (this port's parity source, `errorCodes`) doesn't have
 * this rule yet, but clio-schemas' own catalog schema already forbids it —
 * confirmed directly against `$defs/SpecNoBindElement` in
 * `iowarp/clio-schemas`' `feat/a2ui-data-everywhere` branch, which walks
 * every `bind` object recursively (not just `params[].bind`) the same way
 * this does. This client-only check exists so a bad spec is refused here
 * too, before it ever reaches the server (#1533 #506 LOW).
 */

/** Every guard violation in `spec`, in the same order as the Python guard (empty when it passes). */
export function checkChartSpec(spec: unknown): ChartSpecViolation[] {
  if (!isJsonObject(spec)) {
    return [{ code: 'spec_not_object', path: '', message: 'a chart spec must be a JSON object' }];
  }
  const depth = specDepth(spec);
  if (depth > guardRules.maxDepth) {
    return [
      {
        code: 'spec_too_deep',
        path: '',
        message: `spec nests ${depth} levels; the limit is ${guardRules.maxDepth}`,
      },
    ];
  }
  const violations: ChartSpecViolation[] = [];
  const size = serializedSize(spec);
  if (size > guardRules.maxSpecBytes) {
    violations.push({
      code: 'spec_too_large',
      path: '',
      message: `spec is ${size} bytes; the limit is ${guardRules.maxSpecBytes}`,
    });
  }
  for (const key of Object.keys(spec)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      violations.push({
        code: 'top_level_key_not_allowed',
        path: pointer('', key),
        message: `top-level key '${key}' is not allowed`,
      });
    }
  }
  const views = countViews(spec);
  if (views > guardRules.maxViews) {
    violations.push({
      code: 'too_many_views',
      path: '',
      message: `spec has ${views} views; the limit is ${guardRules.maxViews}`,
    });
  }
  // Pre-order walk in document order, like the Python `_walk`.
  const stack: Array<[string, unknown]> = [['', spec]];
  while (stack.length) {
    const [path, value] = stack.pop()!;
    let children: Array<[string, unknown]>;
    if (isJsonObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(key)) {
          violations.push({
            code: 'forbidden_key',
            path: pointer(path, key),
            message: `'${key}' is not allowed anywhere`,
          });
        } else if (key === 'bind' && isJsonObject(child) && 'element' in child) {
          violations.push({
            code: 'forbidden_bind_element',
            path: pointer(pointer(path, key), 'element'),
            message: "'bind.element' is not allowed — it can bind to any element on the page",
          });
        } else if (key === 'data' && !isNamedSource(child)) {
          violations.push({
            code: 'data_not_named_source',
            path: pointer(path, key),
            message:
              'data must be exactly {"name": "source"}; rows come from the component\'s data or dataUri',
          });
        }
      }
      children = Object.entries(value).map(([key, child]) => [pointer(path, key), child]);
    } else if (Array.isArray(value)) {
      children = value.map((child, index) => [pointer(path, index), child]);
    } else {
      continue;
    }
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]!);
  }
  return violations;
}

/** A one-line, reader-facing summary of the violations (the chart's stated error). */
export function describeChartSpecViolations(violations: readonly ChartSpecViolation[]): string {
  return violations
    .map((violation) => `${violation.message}${violation.path ? ` (at ${violation.path})` : ''}`)
    .join('; ');
}
