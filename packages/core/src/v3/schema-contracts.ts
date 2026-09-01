export { a2uiComponentGeneratedSchema as a2uiComponentSchema } from '../generated/clio-schemas/a2ui-component.schema.js';
export type { A2UIComponent as SchemaA2UIComponent } from '../generated/clio-schemas/_models.js';

/**
 * Payload caps carried by the generated A2UI component contract.
 *
 * The generated schema states each cap inline, so a renderer that wants to
 * declare the same bound has to name a number. These constants are that number,
 * declared once and locked to the generated schema by
 * `schema-contracts.test.ts` — change a cap upstream and the test fails rather
 * than letting a client schema drift away from the wire contract.
 *
 * Do not edit these to change behavior: they describe the contract, they do not
 * define it. Regenerate from `clio-schemas` and update them to match.
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
