import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import clioWorkspaceCatalog from '@/test-fixtures/a2ui/v0_9_1/catalogs/clio-workspace/v1/catalog.json';
import { KERNEL_COMPONENTS } from './kernel-catalog';

/**
 * G2 (#23): the client kernel catalog caps Grid `gap`/`columns` at 12 while
 * the server's JSON-Schema validation accepted any value -- a Grid the
 * client's own catalog rejects still landed on the wire as `rendered: true`
 * and permanently stranded the surface (`processor-store.ts`'s recovery
 * fix handles the client-crash half; this is the schema-drift half).
 *
 * This asserts the invariant generally, for every clio-workspace component
 * both sides declare, not just Grid, and not just top-level properties:
 * every numeric bound (`minimum`/`maximum`, and integer-vs-number), string
 * bound (`minLength`/`maxLength`/`pattern`), array bound (`minItems`/
 * `maxItems`) and `enum` the server's vendored JSON Schema declares must
 * match what this renderer's own zod schema enforces for that same
 * property -- recursing into a component's own locally-defined nested
 * shapes (`$ref: "#/$defs/..."`, e.g. `clio.action-card.v1`'s
 * `actions[].tone`). A `$ref` into the OFFICIAL `common_types.json` (a
 * dynamic binding, an `Action`, ...) is out of this test's scope -- that
 * shape is upstream, not CLIO-authored, and not a simple bound to compare.
 *
 * The vendored copy
 * (`test-fixtures/a2ui/v0_9_1/catalogs/clio-workspace/v1/catalog.json`) is
 * gact-tui's existing mechanism for consuming clio-schemas' JSON Schema
 * without a runtime dependency on the Python package -- the same file
 * `kernel-catalog-contract.test.ts` already proves map/workflow caps
 * against.
 */

type JsonSchemaNode = {
  type?: string;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  items?: JsonSchemaNode;
  properties?: Record<string, JsonSchemaNode>;
  allOf?: Array<Record<string, unknown>>;
  $ref?: string;
};

const CATALOG_DEFS = (clioWorkspaceCatalog.$defs ?? {}) as unknown as Record<string, JsonSchemaNode>;
const CATALOG_COMPONENTS = clioWorkspaceCatalog.components as unknown as Record<
  string,
  JsonSchemaNode
>;

const LOCAL_REF_PREFIX = '#/$defs/';

/**
 * Resolves a node to something with inline `properties`/`type` to compare
 * against: a local `$defs` reference is followed, an `allOf` composition's
 * own property branch is pulled out, and an external (`common_types.json`)
 * `$ref` -- an official, upstream-controlled shape -- resolves to
 * `undefined`, out of scope for this test.
 */
function resolveServerNode(node: JsonSchemaNode | undefined): JsonSchemaNode | undefined {
  if (!node) return undefined;
  if (node.$ref !== undefined) {
    if (!node.$ref.startsWith(LOCAL_REF_PREFIX)) return undefined;
    return resolveServerNode(CATALOG_DEFS[node.$ref.slice(LOCAL_REF_PREFIX.length)]);
  }
  if (node.properties) return node;
  if (node.allOf) {
    const propertiesEntry = node.allOf.find(
      (entry): entry is { properties: Record<string, JsonSchemaNode> } =>
        typeof entry === 'object' && entry !== null && 'properties' in entry,
    );
    return propertiesEntry ? { ...node, properties: propertiesEntry.properties } : node;
  }
  return node;
}

/** Unwraps `.optional()`/`.nullable()`/`.default()` to the underlying zod type. */
function unwrapZodType(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: z.ZodTypeAny = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault
  ) {
    current = current._def.innerType as z.ZodTypeAny;
  }
  return current;
}

const MAX_RECURSION_DEPTH = 6;

/**
 * Compares one property's bounds on both sides and recurses into arrays
 * (`items`) and locally-defined nested objects (`$ref: "#/$defs/..."`).
 * Any shape neither side resolves to a comparable type (a dynamic binding,
 * an official `common_types.json` reference, a plain unconstrained string)
 * is silently out of scope -- this asserts bounds that exist, not that
 * every property has one.
 */
/**
 * A `/` never needs escaping outside a `/.../ ` regex literal's own
 * delimiters, so a zod pattern authored as a regex literal (forced to
 * escape every `/` just to write it) and a Python `pattern` string (never
 * escaped, since Python regexes have no such delimiter) are the SAME
 * pattern even though their `.source` text differs byte-for-byte.
 */
function normalizePattern(source: string): string {
  return source.replace(/\\\//g, '/');
}

function expectBoundsMatch(path: string, clientType: z.ZodTypeAny, serverNode: JsonSchemaNode, depth = 0): void {
  if (depth > MAX_RECURSION_DEPTH) return;
  // Resolved FIRST, before dispatching on type: a scalar-typed property can
  // itself be a top-level `$ref` to a constrained local shape (e.g.
  // `clio.map.v1.categoryField: {"$ref": "#/$defs/FieldName"}`, a bounded
  // string), not only arrays/objects.
  const resolved = resolveServerNode(serverNode);
  if (!resolved) return; // an external (common_types.json) ref -- out of scope
  const unwrapped = unwrapZodType(clientType);

  if (unwrapped instanceof z.ZodNumber) {
    expect(unwrapped.minValue, `${path}: client minimum`).toBe(resolved.minimum ?? null);
    expect(unwrapped.maxValue, `${path}: client maximum`).toBe(resolved.maximum ?? null);
    if (resolved.type === 'integer' || resolved.type === 'number') {
      expect(unwrapped.isInt, `${path}: integer-vs-number`).toBe(resolved.type === 'integer');
    }
    return;
  }

  if (unwrapped instanceof z.ZodEnum) {
    expect([...unwrapped.options].sort(), `${path}: client enum`).toEqual(
      [...(resolved.enum ?? [])].sort(),
    );
    return;
  }

  if (unwrapped instanceof z.ZodString) {
    expect(unwrapped.minLength, `${path}: client minLength`).toBe(resolved.minLength ?? null);
    expect(unwrapped.maxLength, `${path}: client maxLength`).toBe(resolved.maxLength ?? null);
    const clientPattern = unwrapped._def.checks.find(
      (check): check is Extract<typeof check, { kind: 'regex' }> => check.kind === 'regex',
    )?.regex.source;
    if (clientPattern !== undefined || resolved.pattern !== undefined) {
      expect(
        clientPattern ? normalizePattern(clientPattern) : clientPattern,
        `${path}: client pattern`,
      ).toBe(resolved.pattern);
    }
    return;
  }

  if (unwrapped instanceof z.ZodArray) {
    const minItems = unwrapped._def.minLength?.value ?? null;
    const maxItems = unwrapped._def.maxLength?.value ?? null;
    expect(minItems, `${path}: client minItems`).toBe(resolved.minItems ?? null);
    expect(maxItems, `${path}: client maxItems`).toBe(resolved.maxItems ?? null);
    if (resolved.items) {
      expectBoundsMatch(`${path}[]`, unwrapped.element, resolved.items, depth + 1);
    }
    return;
  }

  if (unwrapped instanceof z.ZodObject) {
    if (!resolved.properties) return;
    const clientShape = unwrapped.shape as Record<string, z.ZodTypeAny>;
    for (const [propName, serverProp] of Object.entries(resolved.properties)) {
      const clientProp = clientShape[propName];
      if (!clientProp) continue;
      expectBoundsMatch(`${path}.${propName}`, clientProp, serverProp, depth + 1);
    }
  }
}

/** The component's own declared properties (resolved from its `allOf`). */
function serverProperties(componentName: string): Record<string, JsonSchemaNode> | undefined {
  return resolveServerNode(CATALOG_COMPONENTS[componentName])?.properties;
}

/** Component names both sides declare -- not every server component has a client renderer yet. */
const SHARED_COMPONENT_NAMES = [...KERNEL_COMPONENTS.keys()].filter(
  (name) => serverProperties(name) !== undefined,
);

describe('A2UI catalog bound parity: client zod vs server JSON Schema (G2, #23)', () => {
  it('compares a non-trivial slice of the catalog (sanity against a vacuous pass)', () => {
    expect(SHARED_COMPONENT_NAMES.length).toBeGreaterThan(10);
  });

  it.each(SHARED_COMPONENT_NAMES)('%s: every numeric/string/array bound and enum matches', (componentName) => {
    const clientSchema = KERNEL_COMPONENTS.get(componentName)!.schema;
    const serverProps = serverProperties(componentName)!;
    if (!(clientSchema instanceof z.ZodObject)) return;
    const clientShape = clientSchema.shape as Record<string, z.ZodTypeAny>;

    for (const [propName, serverProp] of Object.entries(serverProps)) {
      const clientProp = clientShape[propName];
      // `component`/`id` and the ComponentCommon/CatalogComponentCommon
      // fields (`weight`, `accessibility`) are framework-level, never part
      // of a component's own zod `schema` (the package contract: "MUST NOT
      // include 'component' or 'id'").
      if (!clientProp) continue;
      expectBoundsMatch(`${componentName}.${propName}`, clientProp, serverProp);
    }
  });
});
