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
      reason: 'This chart does not expose two data fields for box lookup.',
    };
  }
  let xScale: ReturnType<typeof chart.view.scale>;
  let yScale: ReturnType<typeof chart.view.scale>;
  try {
    xScale = chart.view.scale('x');
    yScale = chart.view.scale('y');
  } catch {
    return { available: false, reason: 'This chart has no shared x/y scales for box lookup.' };
  }
  if (!xScale || !yScale) {
    return { available: false, reason: 'This chart has no shared x/y scales for box lookup.' };
  }
  const canvas = host.querySelector('canvas.marks');
  if (!canvas) return { available: false, reason: 'The chart canvas is not ready for box lookup.' };
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

export function captureText(
  surface: CaptureSurface,
  target: CaptureTarget,
  regions: readonly Region[],
): string {
  const component = surfaceComponent(surface, target.componentId);
  const viewReference = target.reference?.();
  const activeQuery =
    viewReference?.query &&
    typeof viewReference.query === 'object' &&
    !Array.isArray(viewReference.query)
      ? (viewReference.query as Record<string, unknown>)
      : undefined;
  const activeDataQuery = activeQuery?.dataQuery as { filter?: unknown } | undefined;
  const context = {
    surface: surface.id,
    revision: surface.revision,
    component: component?.component ?? target.title,
    componentId: target.componentId,
    dataReference:
      activeQuery?.dataUri ??
      component?.dataUri ??
      component?.geojsonUri ??
      component?.meshUri ??
      component?.imageUri ??
      null,
    filters:
      activeDataQuery?.filter ??
      (component?.dataQuery as { filter?: unknown } | undefined)?.filter ??
      [],
    selection: activeQuery?.selection ?? component?.selection ?? null,
    currentView: viewReference?.summary ?? null,
    regions: regions.map((region) => ({
      label: region.id,
      box: (() => {
        const shown = displayedRegion(target.element, region);
        return { x: shown.x, y: shown.y, width: shown.width, height: shown.height };
      })(),
      geographicBounds: region.geographicBounds ?? null,
      comment: region.comment,
      visibleDataUnderBox: visibleTextUnderBox(
        target.element,
        displayedRegion(target.element, region),
      ),
      chartRowsUnderBox: chartRowsUnderBox(target.element, displayedRegion(target.element, region)),
      mapFeaturesUnderBox: mapFeaturesUnderBox(
        target.element,
        displayedRegion(target.element, region),
      ),
      meshNodesUnderBox: meshNodesUnderBox(target.element, displayedRegion(target.element, region)),
    })),
  };
  return [
    `Region capture of ${target.title}. The attached image has labelled boxes.`,
    ...regions.map((region) => `${region.id}: ${region.comment || '(no comment)'}`),
    '```json',
    // Keep the exact structured context while avoiding a hundreds-line code
    // block in the sent conversation when a region covers many data points.
    JSON.stringify(context),
    '```',
  ].join('\n');
}
