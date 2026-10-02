import type { A2UISurface } from '@clio/core/v3';
import { toCanvas } from 'html-to-image';
import { CheckIcon, GripVerticalIcon, ListIcon, SendIcon } from 'lucide-react';
import { CloseIcon, DeleteIcon } from '@/lib/icon-vocabulary';
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useModelImageInput } from '@/lib/model-image-input';
import { mapPngBlob } from './map-export';
import type { MapDebugSurface } from './scientific-map-view';

interface Region {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
  geographicBounds?: { west: number; north: number; east: number; south: number };
}

interface CaptureTarget {
  element: HTMLElement;
  componentId?: string;
  title: string;
  reference?: () => { summary: string; query?: unknown };
}

interface CaptureContext {
  allowed: boolean;
  start: (target: CaptureTarget) => void;
}

// oxlint-disable-next-line react/only-export-components
export const A2uiRegionCaptureContext = createContext<CaptureContext | undefined>(undefined);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function regionRect(region: Region, bounds: DOMRect): CSSProperties {
  return {
    left: region.x * bounds.width,
    top: region.y * bounds.height,
    width: region.width * bounds.width,
    height: region.height * bounds.height,
  };
}

function mapSurface(target: HTMLElement): MapDebugSurface | null {
  return target.matches('[data-slot="a2ui-map-surface"]')
    ? target as MapDebugSurface
    : target.querySelector<MapDebugSurface>('[data-slot="a2ui-map-surface"]');
}

function geographicBounds(target: HTMLElement, region: Region): Region['geographicBounds'] {
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

function displayedRegion(target: HTMLElement, region: Region): Region {
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
  return { ...region, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

function surfaceComponent(surface: A2UISurface, componentId: string | undefined): Record<string, unknown> | undefined {
  if (!componentId) return undefined;
  for (const message of [...(surface.messages as unknown as Record<string, unknown>[])].reverse()) {
    const update = message.updateComponents as { components?: Record<string, unknown>[] } | undefined;
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
  for (const element of target.querySelectorAll('tr, [role="row"], li, [role="listitem"], p, label, h1, h2, h3, h4, h5, h6, input, textarea, [data-slot="a2ui-map-selected-point"], .maplibregl-marker button, svg text')) {
    if (element.matches('p, label, h1, h2, h3, h4, h5, h6') && element.closest('li, [role="listitem"], tr, [role="row"]')) continue;
    const rect = element.getBoundingClientRect();
    if (rect.right < left || rect.left > right || rect.bottom < top || rect.top > bottom) continue;
    const rawValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value
      : element.getAttribute('aria-label') || (element as HTMLElement).innerText || element.textContent;
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
  const host = candidates
    .find((element) => element.__clioChart);
  const chart = host?.__clioChart;
  if (!host || !chart) return null;
  if (!chart.xField || !chart.yField) {
    return { available: false, reason: 'This chart does not expose two data fields for box lookup.' };
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
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < left || x > right || y < top || y > bottom) continue;
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
    const ids = [...new Set(map.queryRenderedFeatures([[left, top], [right, bottom]], { layers }).map((feature) => feature.properties?.id).filter((id): id is string => typeof id === 'string'))];
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

function captureText(surface: A2UISurface, target: CaptureTarget, regions: readonly Region[]): string {
  const component = surfaceComponent(surface, target.componentId);
  const viewReference = target.reference?.();
  const activeQuery = viewReference?.query && typeof viewReference.query === 'object' && !Array.isArray(viewReference.query)
    ? viewReference.query as Record<string, unknown>
    : undefined;
  const activeDataQuery = activeQuery?.dataQuery as { filter?: unknown } | undefined;
  const context = {
    surface: surface.id,
    revision: surface.revision,
    component: component?.component ?? target.title,
    componentId: target.componentId,
    dataReference: activeQuery?.dataUri ?? component?.dataUri ?? component?.geojsonUri ?? component?.meshUri ?? component?.imageUri ?? null,
    filters: activeDataQuery?.filter ?? (component?.dataQuery as { filter?: unknown } | undefined)?.filter ?? [],
    selection: activeQuery?.selection ?? component?.selection ?? null,
    currentView: viewReference?.summary ?? null,
    regions: regions.map((region) => ({
      label: region.id,
      box: (() => { const shown = displayedRegion(target.element, region); return { x: shown.x, y: shown.y, width: shown.width, height: shown.height }; })(),
      geographicBounds: region.geographicBounds ?? null,
      comment: region.comment,
      visibleDataUnderBox: visibleTextUnderBox(target.element, displayedRegion(target.element, region)),
      chartRowsUnderBox: chartRowsUnderBox(target.element, displayedRegion(target.element, region)),
      mapFeaturesUnderBox: mapFeaturesUnderBox(target.element, displayedRegion(target.element, region)),
    })),
  };
  return [
    `Region capture of ${target.title}. The attached image has labelled boxes.`,
    ...regions.map((region) => `${region.id}: ${region.comment || '(no comment)'}`),
    '```json',
    JSON.stringify(context, null, 2),
    '```',
  ].join('\n');
}

async function labelledPng(target: HTMLElement, regions: readonly Region[]): Promise<Blob> {
  const canvas = await toCanvas(target, {
    cacheBust: true,
    filter: (node) => node.nodeType !== Node.ELEMENT_NODE || !(
      (node as Element).getAttribute('data-slot') === 'surface-toolbar' ||
      (node as Element).getAttribute('data-capture-ui') === 'true'
    ),
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  });
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not create an image drawing context.');
  const scaleX = canvas.width / target.getBoundingClientRect().width;
  const scaleY = canvas.height / target.getBoundingClientRect().height;
  const targetRect = target.getBoundingClientRect();
  const mapElement = mapSurface(target);
  const mapCanvas = target.querySelector<HTMLCanvasElement>('canvas.maplibregl-canvas');
  if (mapElement && mapCanvas) {
    if (!mapElement.__clioMap) throw new Error('The map is still loading, so its tiles cannot be captured yet.');
    const mapImage = await createImageBitmap(await mapPngBlob(mapElement.__clioMap));
    const rect = mapCanvas.getBoundingClientRect();
    context.drawImage(mapImage, (rect.left - targetRect.left) * scaleX, (rect.top - targetRect.top) * scaleY, rect.width * scaleX, rect.height * scaleY);
    mapImage.close();
  }
  for (const source of target.querySelectorAll('canvas')) {
    if (source === mapCanvas) continue;
    if (!source.width || !source.height) continue;
    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    try {
      // html-to-image cannot clone a live WebGL framebuffer. Read the live
      // canvas directly while it is still mounted, then paint the boxes last.
      const liveSource = (source.closest<HTMLElement>('[role="img"]') as HTMLElement & { __clioMeshCapture?: () => HTMLCanvasElement } | null)?.__clioMeshCapture?.() ?? source;
      context.drawImage(liveSource, (rect.left - targetRect.left) * scaleX, (rect.top - targetRect.top) * scaleY, rect.width * scaleX, rect.height * scaleY);
    } catch (error) {
      throw new Error(`The ${source.classList.contains('maplibregl-canvas') ? 'map' : 'canvas'} pixels cannot be captured: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const marker of target.querySelectorAll<HTMLElement>('.maplibregl-marker')) {
    const rect = marker.getBoundingClientRect();
    const button = marker.querySelector<HTMLElement>('button');
    if (!rect.width || !rect.height || !button) continue;
    context.beginPath();
    context.arc((rect.left + rect.width / 2 - targetRect.left) * scaleX, (rect.top + rect.height / 2 - targetRect.top) * scaleY, 6 * scaleX, 0, Math.PI * 2);
    context.fillStyle = getComputedStyle(button).color;
    context.fill();
    context.lineWidth = Math.max(1, scaleX);
    context.strokeStyle = '#ffffff';
    context.stroke();
  }
  context.lineWidth = Math.max(2, 2 * scaleX);
  context.font = `bold ${Math.round(14 * scaleX)}px sans-serif`;
  for (const region of regions) {
    const shown = displayedRegion(target, region);
    const x = shown.x * canvas.width;
    const y = shown.y * canvas.height;
    const width = shown.width * canvas.width;
    const height = shown.height * canvas.height;
    context.strokeStyle = '#2563eb';
    context.strokeRect(x, y, width, height);
    const badgeWidth = Math.max(34 * scaleX, context.measureText(region.id).width + 14 * scaleX);
    const badgeHeight = 24 * scaleY;
    context.fillStyle = '#1d4ed8';
    context.fillRect(x, Math.max(0, y - badgeHeight), badgeWidth, badgeHeight);
    context.fillStyle = '#ffffff';
    context.fillText(region.id, x + 7 * scaleX, Math.max(17 * scaleY, y - 7 * scaleY));
  }
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The capture canvas returned no PNG data.')), 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

/** A surface-level camera mode with persistent, labelled visual regions. */
export function A2uiRegionCaptureProvider({ children, surface }: { children: ReactNode; surface: A2UISurface }) {
  const allowed = useModelImageInput();
  const [target, setTarget] = useState<CaptureTarget>();
  const [bounds, setBounds] = useState<DOMRect>();
  const [, updateMapFrame] = useState(0);
  const [regions, setRegions] = useState<Region[]>([]);
  const [draft, setDraft] = useState<Region>();
  const [editingId, setEditingId] = useState<string>();
  const [editText, setEditText] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [controlPosition, setControlPosition] = useState<{ x: number; y: number }>();
  const nextId = useRef(1);
  const dragStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const draftRef = useRef<Region | undefined>(undefined);
  const controlDrag = useRef<{ x: number; y: number; left: number; top: number } | undefined>(undefined);
  const start = useCallback((next: CaptureTarget) => {
    if (!allowed) return;
    if (target?.element !== next.element) {
      setRegions([]);
      nextId.current = 1;
    }
    setTarget(next);
    setSelecting(true);
    setError('');
    const rect = next.element.getBoundingClientRect();
    // Start below the surface toolbar. In full screen the dialog sits above
    // ordinary popovers, so the controls must also stack above that dialog.
    setControlPosition({ x: clamp(rect.right - 265, 8, window.innerWidth - 260), y: clamp(rect.top + 56, 8, window.innerHeight - 90) });
  }, [allowed, target?.element]);
  const context = useMemo(() => ({ allowed, start }), [allowed, start]);
  useEffect(() => {
    if (!target) return;
    let observedMap: NonNullable<MapDebugSurface['__clioMap']> | undefined;
    const onMapMove = () => updateMapFrame((frame) => frame + 1);
    const update = () => {
      if (!target.element.isConnected) {
        const slot = target.element.dataset.slot;
        const candidates = slot
          ? [...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`)]
          : [];
        const replacement = candidates.find((candidate) =>
          candidate.isConnected
          && candidate.getBoundingClientRect().width > 0
          && (!target.componentId || candidate.closest<HTMLElement>('[data-a2ui-component-id]')?.dataset.a2uiComponentId === target.componentId),
        ) ?? (candidates.length === 1 ? candidates[0] : undefined);
        if (replacement) {
          setTarget((current) => current?.element === target.element ? { ...current, element: replacement } : current);
        }
        return;
      }
      const next = target.element.getBoundingClientRect();
      setBounds((current) => current && current.x === next.x && current.y === next.y && current.width === next.width && current.height === next.height ? current : next);
      const map = mapSurface(target.element)?.__clioMap;
      if (map && map !== observedMap) {
        observedMap?.off('move', onMapMove);
        observedMap?.off('resize', onMapMove);
        observedMap = map;
        map.on('move', onMapMove);
        map.on('resize', onMapMove);
      }
    };
    update();
    const timer = window.setInterval(update, 160);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    const sent = () => {
      setRegions([]);
      setDraft(undefined);
      setEditingId(undefined);
      setSelecting(false);
      setTarget(undefined);
    };
    window.addEventListener('clio:message-sent', sent);
    return () => {
      observedMap?.off('move', onMapMove);
      observedMap?.off('resize', onMapMove);
      window.clearInterval(timer);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.removeEventListener('clio:message-sent', sent);
    };
  }, [target]);
  const point = (event: PointerEvent<HTMLElement>) => ({
    x: clamp((event.clientX - bounds!.left) / bounds!.width, 0, 1),
    y: clamp((event.clientY - bounds!.top) / bounds!.height, 0, 1),
  });
  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!selecting || !bounds || event.button !== 0) return;
    const at = point(event);
    dragStart.current = at;
    draftRef.current = { id: `S${nextId.current}`, x: at.x, y: at.y, width: 0, height: 0, comment: '' };
    setDraft(draftRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !draftRef.current) return;
    const at = point(event);
    draftRef.current = { ...draftRef.current, x: Math.min(at.x, dragStart.current.x), y: Math.min(at.y, dragStart.current.y), width: Math.abs(at.x - dragStart.current.x), height: Math.abs(at.y - dragStart.current.y) };
    setDraft(draftRef.current);
  };
  const pointerUp = () => {
    dragStart.current = undefined;
    const finished = draftRef.current;
    draftRef.current = undefined;
    if (!finished || !bounds || finished.width * bounds.width < 6 || finished.height * bounds.height < 6) {
      setDraft(undefined);
      return;
    }
    setRegions((current) => [...current, { ...finished, geographicBounds: target ? geographicBounds(target.element, finished) : undefined }]);
    nextId.current += 1;
    setEditingId(finished.id);
    setEditText('');
    setDraft(undefined);
  };
  const close = () => {
    setTarget(undefined);
    setRegions([]);
    setSelecting(false);
    setEditingId(undefined);
    setError('');
  };
  const done = () => {
    setRegions((current) => current.map((region) => region.id === editingId ? { ...region, comment: editText.trim() } : region));
    setEditingId(undefined);
  };
  const send = async () => {
    if (!target || !regions.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await labelledPng(target.element, regions);
      const file = new File([blob], `clio-capture-${surface.id}-${Date.now()}.png`, { type: 'image/png' });
      window.dispatchEvent(new CustomEvent('clio:add-region-capture', {
        detail: {
          file,
          filename: file.name,
          text: captureText(surface, target, regions),
          title: `Region capture · ${target.title}`,
          summary: `${regions.map((region) => region.id).join(', ')} · ${regions.length} labelled region${regions.length === 1 ? '' : 's'}`,
        },
      }));
      // Staging the image does not end Select mode. The person can add more
      // labelled regions until they turn Select off or send the message.
    } catch (cause) {
      setError(`Capture unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(false);
    }
  };
  const editorRegion = regions.find((region) => region.id === editingId);
  return (
    <A2uiRegionCaptureContext.Provider value={context}>
      {children}
      {target && bounds && createPortal(
          <div
            aria-label={`Select regions on ${target.title}`}
            className="absolute inset-0 z-10"
            data-capture-ui="true"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            role="presentation"
            style={{ pointerEvents: selecting ? 'auto' : 'none', cursor: selecting ? 'crosshair' : undefined, touchAction: 'none' }}
          >
            {[...regions, ...(draft ? [draft] : [])].map((region) => {
              const shown = displayedRegion(target.element, region);
              if (shown.x >= 1 || shown.y >= 1 || shown.x + shown.width <= 0 || shown.y + shown.height <= 0) return null;
              const left = shown.x * bounds.width;
              const top = shown.y * bounds.height;
              return <button
                aria-label={`Edit ${region.id} region${region.comment ? `: ${region.comment}` : ''}`}
                className="absolute border-2 border-blue-600 bg-blue-500/10 text-left"
                key={region.id}
                onClick={() => { setEditingId(region.id); setEditText(region.comment); }}
                onPointerDown={(event) => event.stopPropagation()}
                style={{ ...regionRect(shown, bounds), pointerEvents: 'auto' }}
                type="button"
              >
                <span className="absolute rounded-t bg-blue-700 px-1.5 py-0.5 text-xs font-bold text-white" style={{ left: Math.max(0, -left), top: top >= 24 ? -24 : Math.max(0, -top) }}>{region.id}</span>
              </button>
            })}
          </div>
        , target.element)}
      {target && bounds && createPortal(
        <>
          <div className="fixed z-40 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg" data-capture-ui="true" style={{ left: controlPosition?.x ?? 8, top: controlPosition?.y ?? 8 }}>
            <div className="flex items-center gap-1">
              <button
                aria-label="Move capture controls"
                className="cursor-move rounded p-1 text-muted-foreground hover:bg-muted"
                onPointerDown={(event) => { controlDrag.current = { x: event.clientX, y: event.clientY, left: controlPosition?.x ?? 8, top: controlPosition?.y ?? 8 }; event.currentTarget.setPointerCapture(event.pointerId); }}
                onPointerMove={(event) => { if (controlDrag.current) setControlPosition({ x: clamp(controlDrag.current.left + event.clientX - controlDrag.current.x, 0, window.innerWidth - 250), y: clamp(controlDrag.current.top + event.clientY - controlDrag.current.y, 0, window.innerHeight - 60) }); }}
                onPointerUp={() => { controlDrag.current = undefined; }}
                type="button"
              ><GripVerticalIcon aria-hidden="true" className="size-4" /></button>
              <Button aria-pressed={selecting} onClick={() => setSelecting((active) => !active)} size="sm" variant={selecting ? 'secondary' : 'ghost'}>Select</Button>
              <Button aria-label="Selections list" aria-expanded={listOpen} onClick={() => setListOpen((open) => !open)} size="icon-sm" variant="ghost"><ListIcon aria-hidden="true" className="size-4" /></Button>
              <Button aria-label="Close capture" className="ml-auto" onClick={close} size="icon-sm" variant="ghost"><CloseIcon aria-hidden="true" className="size-4" /></Button>
            </div>
            {listOpen ? <div className="mt-2 max-h-44 space-y-1 overflow-auto border-t pt-2 text-xs">{regions.length ? regions.map((region) => <button className="block w-full truncate rounded p-1 text-left hover:bg-muted" key={region.id} onClick={() => { setEditingId(region.id); setEditText(region.comment); }} type="button">{region.id} · {region.comment || 'Add a comment'}</button>) : <p className="text-muted-foreground">Drag over the surface to add a region.</p>}</div> : null}
            {regions.length ? <Button className="mt-2 w-full" disabled={busy || !!editingId} onClick={() => void send()} size="sm" type="button"><SendIcon aria-hidden="true" className="size-3.5" />{busy ? 'Capturing…' : `Add ${regions.length} ${regions.length === 1 ? 'region' : 'regions'} to message`}</Button> : null}
            {error ? <p className="mt-2 text-xs text-destructive" role="alert">{error}</p> : null}
          </div>
          {editorRegion ? <div className="fixed z-40 w-[min(26rem,calc(100vw-1rem))] rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl" data-capture-ui="true" style={{ left: clamp(bounds.left + (displayedRegion(target.element, editorRegion).x + displayedRegion(target.element, editorRegion).width) * bounds.width - 260, 8, window.innerWidth - 424), top: clamp(bounds.top + (displayedRegion(target.element, editorRegion).y + displayedRegion(target.element, editorRegion).height) * bounds.height + 12, 8, window.innerHeight - 230) }}>
            <p className="mb-2 text-sm font-semibold">{editorRegion.id} · {target.title}</p>
            <textarea autoFocus aria-label={`Comment for ${editorRegion.id}`} className="min-h-28 w-full resize-y rounded-md border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" onChange={(event) => setEditText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setEditingId(undefined); else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); done(); } }} placeholder="What should the agent notice here?" value={editText} />
            <div className="mt-2 flex justify-end gap-2">
              <Button aria-label={`Delete ${editorRegion.id}`} className="mr-auto" onClick={() => { setRegions((current) => current.filter((region) => region.id !== editorRegion.id)); setEditingId(undefined); }} size="icon-sm" variant="ghost"><DeleteIcon aria-hidden="true" className="size-4" /></Button>
              <Button onClick={() => setEditingId(undefined)} size="sm" variant="ghost">Cancel</Button>
              <Button onClick={done} size="sm"><CheckIcon aria-hidden="true" className="size-4" />Done</Button>
            </div>
          </div> : null}
        </>, target.element.closest('[data-slot="dialog-content"]') ?? document.body)}
    </A2uiRegionCaptureContext.Provider>
  );
}
