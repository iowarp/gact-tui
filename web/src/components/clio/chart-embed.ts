import { loader as createLoader, type Loader } from 'vega';
import embed, { type Result, type VisualizationSpec } from 'vega-embed';
import { expressionInterpreter } from 'vega-interpreter';
import { Handler } from 'vega-tooltip';
import { DATA_SOURCE_NAME, isJsonObject } from './chart-spec-guard';
import { CATEGORY_COLORS } from './map-category-palette';

/**
 * Vega-Lite embedding for `clio.chart.v1`, locked down to the chart contract:
 *
 * - rows arrive only as the named dataset `source` (set by the renderer after
 *   it read them), so the loader refuses every URL, file, and link — a spec
 *   has no way to make a request, open a page, or load an image;
 * - expressions run in `vega-interpreter` (`ast: true`), never `new Function`,
 *   so the desktop CSP (`script-src 'self'`) holds;
 * - tooltips are text only: every key and value is HTML-escaped, and an
 *   `image` entry (which vega-tooltip would load) is dropped;
 * - no actions menu (export/source/editor links).
 */

export type ChartRenderer = 'canvas' | 'svg';

/** A Vega loader whose every entry point rejects; the chart's rows never come from it. */
export function refusingLoader(): Loader {
  const refuse = (what: string) => () =>
    Promise.reject(new Error(`A chart cannot load ${what}; its rows come from its data source.`));
  return Object.assign(createLoader(), {
    load: refuse('a URL or file'),
    sanitize: refuse('a link or image'),
    http: refuse('a URL'),
    file: refuse('a file'),
  });
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function tooltipText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unprintable]';
    }
  }
  return String(value);
}

/** Text-only tooltip markup: a title line and a key/value table, all escaped; no images. */
export function formatChartTooltip(value: unknown): string {
  if (!isJsonObject(value)) return `<span>${escapeHtml(tooltipText(value))}</span>`;
  const { title, image: _image, ...entries } = value;
  const heading = title === undefined ? '' : `<h2>${escapeHtml(tooltipText(title))}</h2>`;
  const rows = Object.entries(entries)
    .filter(([, entry]) => entry !== undefined)
    .map(
      ([key, entry]) =>
        `<tr><td class="key">${escapeHtml(key)}</td><td class="value">${escapeHtml(tooltipText(entry))}</td></tr>`,
    )
    .join('');
  return `${heading}${rows ? `<table>${rows}</table>` : ''}`;
}

const COMPOSITION_KEYS = ['facet', 'repeat', 'concat', 'hconcat', 'vconcat'];

/** Whether the spec draws one plot (a unit or a layer) that can take the container's width. */
export function isSingleViewSpec(spec: Record<string, unknown>): boolean {
  if (COMPOSITION_KEYS.some((key) => key in spec)) return false;
  const encoding = spec.encoding;
  return !(
    isJsonObject(encoding) &&
    ('facet' in encoding || 'row' in encoding || 'column' in encoding)
  );
}

/**
 * The spec as embedded: its rows supplied as the `source` dataset (added
 * here, after the guard, which refuses a producer's own `datasets`), and —
 * for a single plot the producer did not size — fitted to the panel's width
 * and the component's height.
 */
export function prepareChartSpec(
  spec: Record<string, unknown>,
  {
    height,
    rows,
    width,
  }: { height: number; rows: readonly Record<string, unknown>[]; width: number | undefined },
): Record<string, unknown> {
  // Presets declare the v5 schema URL; v6 compiles them unchanged, and the
  // mode is set explicitly, so the URL would only raise a version warning.
  const { $schema: _schema, ...prepared } = spec;
  if (!('data' in prepared)) prepared.data = { name: DATA_SOURCE_NAME };
  prepared.datasets = { [DATA_SOURCE_NAME]: rows };
  if (isSingleViewSpec(spec)) {
    if (!('autosize' in prepared)) prepared.autosize = { type: 'fit', contains: 'padding' };
    if (!('width' in prepared) && width) prepared.width = width;
    if (!('height' in prepared)) prepared.height = height;
  }
  return prepared;
}

export function canvasAvailable(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('2d'));
  } catch {
    return false;
  }
}

export interface ChartEmbedOptions {
  dark: boolean;
  renderer: ChartRenderer;
}

/** Embed a prepared Vega-Lite spec into `element` under the restrictions above. */
export function embedChart(
  element: HTMLElement,
  spec: Record<string, unknown>,
  { dark, renderer }: ChartEmbedOptions,
): Promise<Result> {
  const tooltip = new Handler({
    formatTooltip: (value) => formatChartTooltip(value),
    sanitize: escapeHtml,
    theme: dark ? 'dark' : 'light',
  });
  return embed(element, spec as VisualizationSpec, {
    actions: false,
    ast: true,
    config: { background: 'transparent', range: { category: [...CATEGORY_COLORS] } },
    defaultStyle: false,
    expr: expressionInterpreter,
    loader: refusingLoader(),
    mode: 'vega-lite',
    renderer,
    ...(dark ? { theme: 'dark' as const } : {}),
    tooltip: tooltip.call,
  });
}
