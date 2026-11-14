import type { MapDebugSurface } from './scientific-map-view';

export interface Region {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
  geographicBounds?: { west: number; north: number; east: number; south: number };
}

export interface CaptureTarget {
  element: HTMLElement;
  componentId?: string;
  title: string;
  reference?: () => { summary: string; query?: unknown };
  /** The whole surface this part sits in (a dashboard around a chart), offered instead. */
  wider?: CaptureTarget;
}

export interface CaptureSurface {
  id: string;
  revision: number;
  messages: readonly unknown[];
}

export function mapSurface(target: HTMLElement): MapDebugSurface | null {
  return target.matches('[data-slot="a2ui-map-surface"]')
    ? (target as MapDebugSurface)
    : target.querySelector<MapDebugSurface>('[data-slot="a2ui-map-surface"]');
}

export function geographicBounds(
  target: HTMLElement,
  region: Pick<Region, 'x' | 'y' | 'width' | 'height'>,
): Region['geographicBounds'] {
  const map = mapSurface(target)?.__clioMap;
  if (!map) return undefined;
  const targetRect = target.getBoundingClientRect();
  const canvasRect = map.getCanvas().getBoundingClientRect();
  const left = targetRect.left + region.x * targetRect.width - canvasRect.left;
  const top = targetRect.top + region.y * targetRect.height - canvasRect.top;
  const right = left + region.width * targetRect.width;
  const bottom = top + region.height * targetRect.height;
  const northwest = map.unproject([left, top]);
  const southeast = map.unproject([right, bottom]);
  return { west: northwest.lng, north: northwest.lat, east: southeast.lng, south: southeast.lat };
}

export function displayedRegion(target: HTMLElement, region: Region): Region {
  const map = mapSurface(target)?.__clioMap;
  if (!map || !region.geographicBounds) return region;
  const targetRect = target.getBoundingClientRect();
  const canvasRect = map.getCanvas().getBoundingClientRect();
  const northwest = map.project([region.geographicBounds.west, region.geographicBounds.north]);
  const southeast = map.project([region.geographicBounds.east, region.geographicBounds.south]);
  const x1 = (canvasRect.left + northwest.x - targetRect.left) / targetRect.width;
  const x2 = (canvasRect.left + southeast.x - targetRect.left) / targetRect.width;
  const y1 = (canvasRect.top + northwest.y - targetRect.top) / targetRect.height;
  const y2 = (canvasRect.top + southeast.y - targetRect.top) / targetRect.height;
  return {
    ...region,
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function surfaceComponent(
  surface: CaptureSurface,
  componentId: string | undefined,
): Record<string, unknown> | undefined {
  if (!componentId) return undefined;
  for (const message of [...(surface.messages as unknown as Record<string, unknown>[])].reverse()) {
    const update = message.updateComponents as
      | { components?: Record<string, unknown>[] }
      | undefined;
    const component = update?.components?.find((item) => item.id === componentId);
    if (component) return component;
  }
  return undefined;
}

function visibleTextUnderBox(target: HTMLElement, region: Region): string[] {
  const bounds = target.getBoundingClientRect();
  const left = bounds.left + region.x * bounds.width;
  const top = bounds.top + region.y * bounds.height;
  const right = left + region.width * bounds.width;
  const bottom = top + region.height * bounds.height;
  const values = new Set<string>();
  for (const element of target.querySelectorAll(
    'tr, [role="row"], li, [role="listitem"], p, label, h1, h2, h3, h4, h5, h6, input, textarea, [data-slot="a2ui-map-selected-point"], .maplibregl-marker button, svg text',
  )) {
    if (
      element.matches('p, label, h1, h2, h3, h4, h5, h6') &&
      element.closest('li, [role="listitem"], tr, [role="row"]')
    )
      continue;
    const rect = element.getBoundingClientRect();
    if (rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom) continue;
    const rawValue =
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : element.getAttribute('aria-label') ||
          (element as HTMLElement).innerText ||
          element.textContent;
    const value = rawValue?.trim().replace(/\s+/gu, ' ');
    if (value) values.add(value.slice(0, 500));
    if (values.size === 30) break;
  }
  return [...values];
}

interface CapturableChart extends HTMLElement {
  __clioChart?: {
    view: {
      origin: () => [number, number];
      scale: (name: string) => ((value: unknown) => number) & { bandwidth?: () => number };
    };
    rows: () => readonly Record<string, unknown>[];
    xField?: string;
    yField?: string;
  };
}

function chartRowsUnderBox(target: HTMLElement, region: Region): Record<string, unknown> | null {
  const candidates = target.matches('[data-slot="a2ui-chart-view"]')
    ? [target as CapturableChart]
    : [...target.querySelectorAll<CapturableChart>('[data-slot="a2ui-chart-view"]')];
  const host = candidates.find((element) => element.__clioChart);
  const chart = host?.__clioChart;
  if (!host || !chart) return null;
  if (!chart.xField || !chart.yField) {
    return {
      available: false,
      // i18n-ignore: evidence line sent to the agent
      reason: 'This chart does not expose two data fields for box lookup.',
    };
  }
  let xScale: ReturnType<typeof chart.view.scale>;
  let yScale: ReturnType<typeof chart.view.scale>;
  try {
    xScale = chart.view.scale('x');
    yScale = chart.view.scale('y');
  } catch {
    // i18n-ignore: evidence line sent to the agent
    return { available: false, reason: 'This chart has no shared x/y scales for box lookup.' };
  }
  if (!xScale || !yScale) {
    // i18n-ignore: evidence line sent to the agent
    return { available: false, reason: 'This chart has no shared x/y scales for box lookup.' };
  }
  const canvas = host.querySelector('canvas.marks');
  if (!canvas)
    // i18n-ignore: evidence line sent to the agent
    return { available: false, reason: 'The chart canvas is not ready for box lookup.' };
  const bounds = target.getBoundingClientRect();
  const canvasBounds = canvas.getBoundingClientRect();
  const [originX, originY] = chart.view.origin();
  const left = bounds.left + region.x * bounds.width;
  const top = bounds.top + region.y * bounds.height;
  const right = left + region.width * bounds.width;
  const bottom = top + region.height * bounds.height;
  const matches: Record<string, unknown>[] = [];
  let count = 0;
  for (const row of chart.rows()) {
    const rawX = row[chart.xField];
    const rawY = row[chart.yField];
    const x = canvasBounds.left + originX + xScale(rawX) + (xScale.bandwidth?.() ?? 0) / 2;
    const y = canvasBounds.top + originY + yScale(rawY) + (yScale.bandwidth?.() ?? 0) / 2;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < left ||
      x > right ||
      y < top ||
      y > bottom
    )
      continue;
    count += 1;
    if (matches.length < 100) matches.push(row);
  }
  return { available: true, count, rows: matches, rowsTruncated: count > matches.length };
}

function mapFeaturesUnderBox(target: HTMLElement, region: Region): Record<string, unknown> | null {
  const mapElement = mapSurface(target);
  const map = mapElement?.__clioMap;
  const layers = [
    'clio-map-points-circles',
    'clio-map-geometry-fill',
    'clio-map-geometry-line',
    'clio-map-geometry-points',
  ].filter((id) => map?.getLayer(id));
  if (!map || !layers.length) return null;
  const canvasRect = map.getCanvas().getBoundingClientRect();
  const bounds = target.getBoundingClientRect();
  const left = bounds.left + region.x * bounds.width - canvasRect.left;
  const top = bounds.top + region.y * bounds.height - canvasRect.top;
  const right = left + region.width * bounds.width;
  const bottom = top + region.height * bounds.height;
  try {
    const ids = [
      ...new Set(
        map
          .queryRenderedFeatures(
            [
              [left, top],
              [right, bottom],
            ],
            { layers },
          )
          .map((feature) => feature.properties?.id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ];
    const northwest = map.unproject([left, top]);
    const southeast = map.unproject([right, bottom]);
    return {
      count: ids.length,
      ids: ids.slice(0, 100),
      idsTruncated: ids.length > 100,
      geographicBounds: {
        west: northwest.lng,
        north: northwest.lat,
        east: southeast.lng,
        south: southeast.lat,
      },
    };
  } catch {
    return null;
  }
}

function meshNodesUnderBox(target: HTMLElement, region: Region): Record<string, unknown> | null {
  const mesh = target as HTMLElement & {
    __clioMeshInspect?: (box: {
      left: number;
      top: number;
      right: number;
      bottom: number;
    }) => Record<string, unknown>;
  };
  if (!mesh.__clioMeshInspect) return null;
  const bounds = target.getBoundingClientRect();
  return mesh.__clioMeshInspect({
    left: region.x * bounds.width,
    top: region.y * bounds.height,
    right: (region.x + region.width) * bounds.width,
    bottom: (region.y + region.height) * bounds.height,
  });
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  if (typeof value === 'object')
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key} ${valueText(item)}`)
      .join(', ');
  return '';
}

/** What lies under one box, as readable lines (addendum A, section 2): no JSON. */
export function regionUnderLines(target: CaptureTarget, region: Region): string[] {
  const shown = displayedRegion(target.element, region);
  const lines: string[] = [];
  const text = visibleTextUnderBox(target.element, shown);
  // i18n-ignore: evidence line sent to the agent
  if (text.length) lines.push(`Visible text: ${text.join('; ')}`);
  const chart = chartRowsUnderBox(target.element, shown);
  // i18n-ignore: evidence line sent to the agent
  if (chart && chart.available === false) lines.push(`Chart rows: ${valueText(chart.reason)}`);
  else if (chart) {
    const rows = (chart.rows as Record<string, unknown>[] | undefined) ?? [];
    lines.push(
      // i18n-ignore: evidence line sent to the agent
      `Chart rows: ${valueText(chart.count)} under the box${chart.rowsTruncated ? ` (first ${rows.length} listed)` : ''}`,
    );
    for (const row of rows) lines.push(`  ${valueText(row)}`);
  }
  const map = mapFeaturesUnderBox(target.element, shown);
  if (map) {
    const ids = (map.ids as string[] | undefined) ?? [];
    lines.push(
      // i18n-ignore: evidence line sent to the agent
      `Map features: ${valueText(map.count)}${ids.length ? `: ${ids.join(', ')}` : ''}${map.idsTruncated ? ' (first 100)' : ''}`,
    );
  }
  const mesh = meshNodesUnderBox(target.element, shown);
  // i18n-ignore: evidence line sent to the agent
  if (mesh) lines.push(`Mesh: ${valueText(mesh)}`);
  return lines;
}

/**
 * The surface context one A2UI comment session carries on each mark's anchor: the surface,
 * its revision, the component and its data, the active filters and selection, and the
 * readable lines under the box. The service writes them as the entry's lines.
 */
export function regionSource(
  surface: CaptureSurface,
  target: CaptureTarget,
  region: Region,
): Record<string, unknown> {
  const component = surfaceComponent(surface, target.componentId);
  const viewReference = target.reference?.();
  const activeQuery =
    viewReference?.query &&
    typeof viewReference.query === 'object' &&
    !Array.isArray(viewReference.query)
      ? (viewReference.query as Record<string, unknown>)
      : undefined;
  const activeDataQuery = activeQuery?.dataQuery as { filter?: unknown } | undefined;
  const filters =
    activeDataQuery?.filter ??
    (component?.dataQuery as { filter?: unknown } | undefined)?.filter ??
    [];
  return {
    surface: surface.id,
    revision: surface.revision,
    component: valueText(component?.component ?? target.title),
    component_id: target.componentId,
    data_reference: valueText(
      activeQuery?.dataUri ??
        component?.dataUri ??
        component?.geojsonUri ??
        component?.meshUri ??
        component?.imageUri,
    ),
    filters: valueText(filters),
    selection: valueText(activeQuery?.selection ?? component?.selection),
    view: valueText(viewReference?.summary),
    geographic_bounds: region.geographicBounds,
    under: regionUnderLines(target, region),
  };
}
