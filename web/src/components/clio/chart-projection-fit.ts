import { isJsonObject } from './chart-spec-guard';

/**
 * Renderer default for `clio.chart.v1`'s `projection.fit` (owner ruling,
 * `feedback_affordances_are_renderer_defaults.md` — #1549 G4 review): a
 * `geoshape` mark whose shape channel is a `geojson`-typed field draws every
 * coordinate as `NaN` when `projection.fit` is left to the installed vega/
 * vega-lite's own data-driven auto-fit (`chart-gallery-render.test.ts` and
 * clio-schemas' companion fix both document the live-verified bug). The
 * agent should never have to know this Vega quirk — the renderer is
 * responsible for the affordance, same as every other built-in default. This
 * module computes it from the geometry cells actually present in the rows,
 * wherever a geoshape unit's governing `projection` is missing `fit`.
 *
 * An agent-authored `fit` always wins: this only fills a gap the agent left
 * open, never overrides one it set. `fit` stays an allowed, unrestricted
 * value under the chart spec guard (`chart-spec-guard.ts`) either way.
 *
 * Longitude/latitude point maps are unaffected: their own fit mechanism
 * (an extent over the lon/lat fields, not the `geojson` transform) already
 * resolves correctly — live-verified alongside the geoshape bug above, see
 * `chart-gallery-render.test.ts`'s lon/lat case — so nothing is injected for
 * them.
 *
 * Deliberately its own module, not a change to `chart-embed.ts` /
 * `chart-zoom.ts` (under a separate G0 rewrite, #516): call this with the
 * prepared spec and the rows about to be embedded, from one line in the
 * embed path.
 */

type JsonObject = Record<string, unknown>;

const COMPOSITION_ARRAY_KEYS = ['layer', 'concat', 'hconcat', 'vconcat'] as const;

/** Every "unit spec" object (anything with its own `mark`) anywhere in `spec`, pre-order. */
function unitSpecs(spec: unknown): JsonObject[] {
  const found: JsonObject[] = [];
  const stack: unknown[] = [spec];
  while (stack.length) {
    const node = stack.pop();
    if (!isJsonObject(node)) continue;
    for (const key of COMPOSITION_ARRAY_KEYS) {
      const children = node[key];
      if (Array.isArray(children)) for (const child of children) stack.push(child);
    }
    if (('facet' in node || 'repeat' in node) && isJsonObject(node.spec)) stack.push(node.spec);
    if ('mark' in node) found.push(node);
  }
  return found;
}

/** The dataset column a geoshape unit's `shape` channel reads, or `undefined` for any other mark. */
function geojsonShapeField(unit: JsonObject): string | undefined {
  const mark = typeof unit.mark === 'string' ? unit.mark : (unit.mark as JsonObject | null)?.type;
  if (mark !== 'geoshape') return undefined;
  const shape = isJsonObject(unit.encoding) ? unit.encoding.shape : undefined;
  if (!isJsonObject(shape) || shape.type !== 'geojson' || typeof shape.field !== 'string') {
    return undefined;
  }
  return shape.field;
}

/** A GeoJSON `FeatureCollection` wrapping every row's geometry value at one of `fields`. */
function featureCollectionFromRows(
  rows: readonly Record<string, unknown>[],
  fields: readonly string[],
): JsonObject | undefined {
  const features: JsonObject[] = [];
  for (const row of rows) {
    for (const field of fields) {
      const geometry = row[field];
      if (isJsonObject(geometry) && typeof geometry.type === 'string') {
        features.push({ type: 'Feature', properties: {}, geometry });
      }
    }
  }
  return features.length ? { type: 'FeatureCollection', features } : undefined;
}

/**
 * Fills `projection.fit` for every geoshape unit (anywhere in `spec` — a
 * layer, a facet/repeat's inner spec, a concat branch, or the top level
 * itself) whose governing `projection` object is present but has no `fit`
 * of its own. Several units sharing one `projection` get one `fit` spanning
 * all of their geometry. Returns `spec` unchanged (same reference) when
 * there is nothing to fill in; otherwise returns a deep clone with only the
 * needed `projection.fit` values set — never mutates the caller's spec.
 */
export function withDefaultProjectionFit(
  spec: Record<string, unknown>,
  rows: readonly Record<string, unknown>[],
): Record<string, unknown> {
  if (!isJsonObject(spec)) return spec;
  const geoUnits = unitSpecs(spec)
    .map((unit) => ({ unit, field: geojsonShapeField(unit) }))
    .filter((entry): entry is { unit: JsonObject; field: string } => entry.field !== undefined);
  if (!geoUnits.length) return spec;
  const needsFit = geoUnits.some(({ unit }) => {
    const projection = isJsonObject(unit.projection) ? unit.projection : spec.projection;
    return isJsonObject(projection) && projection.fit === undefined;
  });
  if (!needsFit) return spec;

  const cloned = structuredClone(spec) as JsonObject;
  const clonedGeoUnits = unitSpecs(cloned)
    .map((unit) => ({ unit, field: geojsonShapeField(unit) }))
    .filter((entry): entry is { unit: JsonObject; field: string } => entry.field !== undefined);

  const fieldsByProjection = new Map<JsonObject, string[]>();
  for (const { unit, field } of clonedGeoUnits) {
    const projection = isJsonObject(unit.projection)
      ? unit.projection
      : isJsonObject(cloned.projection)
        ? cloned.projection
        : undefined;
    if (!projection || projection.fit !== undefined) continue; // no projection to default, or the agent's own fit wins.
    const fields = fieldsByProjection.get(projection) ?? [];
    fields.push(field);
    fieldsByProjection.set(projection, fields);
  }

  for (const [projection, fields] of fieldsByProjection) {
    const collection = featureCollectionFromRows(rows, fields);
    if (collection) projection.fit = collection;
  }
  return cloned;
}
