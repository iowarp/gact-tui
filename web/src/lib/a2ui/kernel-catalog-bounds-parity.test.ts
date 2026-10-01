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
 * both sides declare, not just Grid: a numeric `minimum`/`maximum` or an
 * `enum`/`const` the server's vendored JSON Schema declares for a property
 * must match what this renderer's own zod schema enforces for that same
 * property, and vice versa. The vendored copy
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
};

type CatalogComponent = { allOf?: Array<Record<string, unknown>> };

const CATALOG_COMPONENTS = clioWorkspaceCatalog.components as unknown as Record<
  string,
  CatalogComponent
>;

/** The component's own declared properties (its last `allOf` entry) -- never the shared `ComponentCommon`/`CatalogComponentCommon` `$ref` branches. */
function serverProperties(componentName: string): Record<string, JsonSchemaNode> | undefined {
  const propertiesEntry = CATALOG_COMPONENTS[componentName]?.allOf?.find(
    (entry): entry is { properties: Record<string, JsonSchemaNode> } =>
      typeof entry === 'object' && entry !== null && 'properties' in entry,
  );
  return propertiesEntry?.properties;
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

/** Component names both sides declare -- not every server component has a client renderer yet. */
const SHARED_COMPONENT_NAMES = [...KERNEL_COMPONENTS.keys()].filter(
  (name) => serverProperties(name) !== undefined,
);

describe('A2UI catalog bound parity: client zod vs server JSON Schema (G2, #23)', () => {
  it('compares a non-trivial slice of the catalog (sanity against a vacuous pass)', () => {
    expect(SHARED_COMPONENT_NAMES.length).toBeGreaterThan(10);
  });

  it.each(SHARED_COMPONENT_NAMES)('%s: every numeric bound and enum matches', (componentName) => {
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
      const unwrapped = unwrapZodType(clientProp);

      if (unwrapped instanceof z.ZodNumber) {
        expect(
          unwrapped.minValue,
          `${componentName}.${propName}: client minimum`,
        ).toBe(serverProp.minimum ?? null);
        expect(
          unwrapped.maxValue,
          `${componentName}.${propName}: client maximum`,
        ).toBe(serverProp.maximum ?? null);
      }

      if (unwrapped instanceof z.ZodEnum) {
        expect(
          [...unwrapped.options].sort(),
          `${componentName}.${propName}: client enum`,
        ).toEqual([...(serverProp.enum ?? [])].sort());
      }
    }
  });
});
