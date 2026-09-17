/**
 * Payload caps carried by the CLIO workspace catalog file (0.9.1).
 *
 * The A2UI catalogs registry (`GET /v1/sessions/{sid}/a2ui/catalogs`) is the
 * runtime source of truth for these bounds now that the closed generated
 * component union is gone (S1/S6, docs/design/a2ui-compat-campaign-2026-09.md)
 * — the catalog file states each cap inline as JSON Schema `maxItems`/
 * `maxLength`. A renderer that wants to declare the same bound as a static
 * zod cap has to name a number; these constants are that number, declared
 * once and locked to the vendored `clio-workspace/v1` catalog fixture by
 * `schema-contracts.test.ts` — change a cap in clio-schemas and the test
 * fails rather than letting a client schema drift away from the wire
 * contract.
 *
 * Do not edit these to change behavior: they describe the contract, they do
 * not define it. Regenerate from `clio-schemas` and update them to match.
 */

/** Points accepted by one `clio.map.v1` surface. Unit: points. */
export const A2UI_MAP_POINTS_MAX = 500;
/** Length of a map point's identifier. Unit: characters. */
export const A2UI_MAP_POINT_ID_MAX_CHARS = 128;
/** Length of a map point's label. Unit: characters. */
export const A2UI_MAP_POINT_LABEL_MAX_CHARS = 240;
/** Length of a map point's detail text. Unit: characters. */
export const A2UI_MAP_POINT_DETAIL_MAX_CHARS = 2_000;
/** Length of a map point's category name. Unit: characters. */
export const A2UI_MAP_POINT_CATEGORY_MAX_CHARS = 120;
/** Rows accepted by one `clio.time-series.v1` surface. Unit: rows. */
export const A2UI_TIME_SERIES_ROWS_MAX = 10_000;
/** Plotted series accepted by one time-series surface. Unit: keys. */
export const A2UI_TIME_SERIES_Y_KEYS_MAX = 5;
/** Nodes accepted by one `clio.workflow.v1` surface. Unit: nodes. */
export const A2UI_WORKFLOW_NODES_MAX = 128;
/** Edges accepted by one workflow surface. Unit: edges. */
export const A2UI_WORKFLOW_EDGES_MAX = 256;
