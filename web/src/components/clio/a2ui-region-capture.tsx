import {
  captureText,
  displayedRegion,
  geographicBounds,
  mapSurface,
  type CaptureSurface,
  type CaptureTarget,
  type Region,
} from './a2ui-region-evidence';
export type { CaptureSurface } from './a2ui-region-evidence';
import { toCanvas } from 'html-to-image';
import { CheckIcon, GripVerticalIcon, ListIcon, SendIcon } from 'lucide-react';
import { CloseIcon, DeleteIcon } from '@/lib/icon-vocabulary';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useModelImageInput } from '@/lib/model-image-input';
import { SurfaceAttentionContext } from '@/lib/a2ui/attention-selection';
import { RegionCoordinateInputs } from './region-coordinate-inputs';
import { imageAttentionRegion } from '@/lib/a2ui/attention-selection-coordinates';
import { InfoTip } from './info-tip';
import { mapPngBlob } from './map-export';
import type { MapDebugSurface } from './scientific-map-view';

interface CaptureContext {
  allowed: boolean;
  start: (target: CaptureTarget) => void;
  selectingComponentId?: string;
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

async function labelledPng(target: HTMLElement, regions: readonly Region[]): Promise<Blob> {
  let background: Element | null = target;
  let backgroundColor = 'white';
  while (background) {
    const color = getComputedStyle(background).backgroundColor;
    if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') {
      backgroundColor = color;
      break;
    }
    background = background.parentElement;
  }
  const canvas = await toCanvas(target, {
    cacheBust: true,
    backgroundColor,
    filter: (node) =>
      node.nodeType !== Node.ELEMENT_NODE ||
      !(
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
  const mapCanvases = new Set<HTMLCanvasElement>();
  for (const mapElement of target.querySelectorAll<MapDebugSurface>(
    '[data-slot="a2ui-map-surface"]',
  )) {
    const mapCanvas = mapElement.querySelector<HTMLCanvasElement>('canvas.maplibregl-canvas');
    if (!mapCanvas || !mapCanvas.getBoundingClientRect().width) continue;
    mapCanvases.add(mapCanvas);
    if (!mapElement.__clioMap)
      throw new Error('The map is still loading, so its tiles cannot be captured yet.');
    const mapImage = await createImageBitmap(await mapPngBlob(mapElement.__clioMap));
    const rect = mapCanvas.getBoundingClientRect();
    context.drawImage(
      mapImage,
      (rect.left - targetRect.left) * scaleX,
      (rect.top - targetRect.top) * scaleY,
      rect.width * scaleX,
      rect.height * scaleY,
    );
    mapImage.close();
    // The live WebGL frame covers the DOM clone's markers and attribution.
    // Composite the actual DOM overlay above it, retaining marker colours,
    // icons, popups and labels instead of drawing approximate white dots.
    const overlay = await toCanvas(mapElement, {
      cacheBust: true,
      backgroundColor: 'transparent',
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      filter: (node) => !(node instanceof HTMLCanvasElement),
    });
    const overlayRect = mapElement.getBoundingClientRect();
    context.drawImage(
      overlay,
      (overlayRect.left - targetRect.left) * scaleX,
      (overlayRect.top - targetRect.top) * scaleY,
      overlayRect.width * scaleX,
      overlayRect.height * scaleY,
    );
  }
  for (const source of target.querySelectorAll('canvas')) {
    if (mapCanvases.has(source)) continue;
    if (!source.width || !source.height) continue;
    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    try {
      // html-to-image cannot clone a live WebGL framebuffer. Read the live
      // canvas directly while it is still mounted, then paint the boxes last.
      const liveSource =
        (
          source.closest<HTMLElement>('[role="img"]') as
            | (HTMLElement & { __clioMeshCapture?: () => HTMLCanvasElement })
            | null
        )?.__clioMeshCapture?.() ?? source;
      context.drawImage(
        liveSource,
        (rect.left - targetRect.left) * scaleX,
        (rect.top - targetRect.top) * scaleY,
        rect.width * scaleX,
        rect.height * scaleY,
      );
    } catch (error) {
      throw new Error(
        `The ${source.classList.contains('maplibregl-canvas') ? 'map' : 'canvas'} pixels cannot be captured: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error('The capture canvas returned no PNG data.')),
        'image/png',
      );
    } catch (error) {
      reject(error);
    }
  });
}

/** A surface-level camera mode with persistent, labelled visual regions. */
/** Capture the displayed artifact, including live mesh and map canvases. */
// oxlint-disable-next-line react/only-export-components
export async function captureRenderedSurfacePng(target: HTMLElement): Promise<Blob> {
  return labelledPng(target, []);
}

export function A2uiRegionCaptureProvider({
  children,
  surface,
  allowDemoCapture = false,
}: {
  children: ReactNode;
  surface: CaptureSurface;
  allowDemoCapture?: boolean;
}) {
  const acceptsImages = useModelImageInput();
  const attention = useContext(SurfaceAttentionContext);
  const allowed = allowDemoCapture || acceptsImages || Boolean(attention);
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
  const controlDrag = useRef<{ x: number; y: number; left: number; top: number } | undefined>(
    undefined,
  );
  const start = useCallback(
    (next: CaptureTarget) => {
      if (!allowed) return;
      if (target?.element === next.element) {
        setSelecting((active) => !active);
        return;
      }
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
      setControlPosition({
        x: clamp(rect.right - 265, 8, window.innerWidth - 260),
        y: clamp(rect.top + 56, 8, window.innerHeight - 90),
      });
    },
    [allowed, target?.element],
  );
  const context = useMemo(
    () => ({ allowed, start, selectingComponentId: selecting ? target?.componentId : undefined }),
    [allowed, start, selecting, target?.componentId],
  );
  useEffect(() => {
    if (!selecting || !target) return;
    const leaveCaptureForOtherTool = (event: globalThis.PointerEvent) => {
      const button = (event.target as Element).closest('button');
      if (
        !button ||
        button.closest('[data-capture-ui="true"]') ||
        button.matches('[data-capture-toggle="true"]')
      )
        return;
      const component = target.element.closest<HTMLElement>('.group');
      if (component?.contains(button)) setSelecting(false);
    };
    document.addEventListener('pointerdown', leaveCaptureForOtherTool, true);
    return () => document.removeEventListener('pointerdown', leaveCaptureForOtherTool, true);
  }, [selecting, target]);
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
        const replacement =
          candidates.find(
            (candidate) =>
              candidate.isConnected &&
              candidate.getBoundingClientRect().width > 0 &&
              (!target.componentId ||
                candidate.closest<HTMLElement>('[data-a2ui-component-id]')?.dataset
                  .a2uiComponentId === target.componentId),
          ) ?? (candidates.length === 1 ? candidates[0] : undefined);
        if (replacement) {
          setTarget((current) =>
            current?.element === target.element ? { ...current, element: replacement } : current,
          );
        }
        return;
      }
      const next = target.element.getBoundingClientRect();
      setBounds((current) =>
        current &&
        current.x === next.x &&
        current.y === next.y &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
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
    draftRef.current = {
      id: `S${nextId.current}`,
      x: at.x,
      y: at.y,
      width: 0,
      height: 0,
      comment: '',
    };
    setDraft(draftRef.current);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !draftRef.current) return;
    const at = point(event);
    draftRef.current = {
      ...draftRef.current,
      x: Math.min(at.x, dragStart.current.x),
      y: Math.min(at.y, dragStart.current.y),
      width: Math.abs(at.x - dragStart.current.x),
      height: Math.abs(at.y - dragStart.current.y),
    };
    setDraft(draftRef.current);
  };
  const pointerUp = () => {
    dragStart.current = undefined;
    const finished = draftRef.current;
    draftRef.current = undefined;
    if (
      !finished ||
      !bounds ||
      finished.width * bounds.width < 6 ||
      finished.height * bounds.height < 6
    ) {
      setDraft(undefined);
      return;
    }
    setRegions((current) => [
      ...current,
      {
        ...finished,
        geographicBounds: target ? geographicBounds(target.element, finished) : undefined,
      },
    ]);
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
    setRegions((current) =>
      current.map((region) =>
        region.id === editingId ? { ...region, comment: editText.trim() } : region,
      ),
    );
    setEditingId(undefined);
  };
  const send = async () => {
    if (!target || !regions.length || busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await labelledPng(target.element, regions);
      const file = new File([blob], `clio-capture-${surface.id}-${Date.now()}.png`, {
        type: 'image/png',
      });
      window.dispatchEvent(
        new CustomEvent('clio:add-region-capture', {
          detail: {
            file,
            filename: file.name,
            text: captureText(surface, target, regions),
            title: `Region capture · ${target.title}`,
            summary: `${regions.map((region) => region.id).join(', ')} · ${regions.length} labelled region${regions.length === 1 ? '' : 's'}`,
          },
        }),
      );
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
      {target &&
        bounds &&
        createPortal(
          <div
            aria-label={`Select regions on ${target.title}`}
            className="absolute inset-0 z-10"
            data-capture-ui="true"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            role="presentation"
            style={{
              pointerEvents: selecting ? 'auto' : 'none',
              cursor: selecting ? 'crosshair' : undefined,
              touchAction: 'none',
            }}
          >
            {[...regions, ...(draft ? [draft] : [])].map((region) => {
              const shown = displayedRegion(target.element, region);
              if (
                shown.x >= 1 ||
                shown.y >= 1 ||
                shown.x + shown.width <= 0 ||
                shown.y + shown.height <= 0
              )
                return null;
              const left = shown.x * bounds.width;
              const top = shown.y * bounds.height;
              return (
                <button
                  aria-label={`Edit ${region.id} region${region.comment ? `: ${region.comment}` : ''}`}
                  className="absolute border-2 border-blue-600 bg-blue-500/10 text-left"
                  key={region.id}
                  onClick={() => {
                    setEditingId(region.id);
                    setEditText(region.comment);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{ ...regionRect(shown, bounds), pointerEvents: 'auto' }}
                  type="button"
                >
                  <span
                    className="absolute rounded-t bg-blue-700 px-1.5 py-0.5 text-xs font-bold text-white"
                    style={{ left: Math.max(0, -left), top: top >= 24 ? -24 : Math.max(0, -top) }}
                  >
                    {region.id}
                  </span>
                </button>
              );
            })}
          </div>,
          target.element,
        )}
      {target &&
        bounds &&
        createPortal(
          <>
            <div
              className="fixed z-40 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
              data-capture-ui="true"
              style={{ left: controlPosition?.x ?? 8, top: controlPosition?.y ?? 8 }}
            >
              <div className="flex items-center gap-1">
                <button
                  aria-label="Move capture controls"
                  className="cursor-move rounded p-1 text-muted-foreground hover:bg-muted"
                  onPointerDown={(event) => {
                    controlDrag.current = {
                      x: event.clientX,
                      y: event.clientY,
                      left: controlPosition?.x ?? 8,
                      top: controlPosition?.y ?? 8,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    if (controlDrag.current)
                      setControlPosition({
                        x: clamp(
                          controlDrag.current.left + event.clientX - controlDrag.current.x,
                          0,
                          window.innerWidth - 250,
                        ),
                        y: clamp(
                          controlDrag.current.top + event.clientY - controlDrag.current.y,
                          0,
                          window.innerHeight - 60,
                        ),
                      });
                  }}
                  onPointerUp={() => {
                    controlDrag.current = undefined;
                  }}
                  type="button"
                >
                  <GripVerticalIcon aria-hidden="true" className="size-4" />
                </button>
                <Button
                  aria-pressed={selecting}
                  onClick={() => setSelecting((active) => !active)}
                  size="sm"
                  variant={selecting ? 'secondary' : 'ghost'}
                >
                  Select
                </Button>
                <Button
                  aria-label="Selections list"
                  aria-expanded={listOpen}
                  onClick={() => setListOpen((open) => !open)}
                  size="icon-sm"
                  variant="ghost"
                >
                  <ListIcon aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  aria-label="Close capture"
                  className="ml-auto"
                  onClick={close}
                  size="icon-sm"
                  variant="ghost"
                >
                  <CloseIcon aria-hidden="true" className="size-4" />
                </Button>
              </div>
              <Button
                className="mt-2 w-full"
                size="sm"
                variant="outline"
                disabled={busy || regions.length >= 32}
                onClick={() => {
                  const region: Region = {
                    id: `S${nextId.current++}`,
                    x: 0.25,
                    y: 0.25,
                    width: 0.5,
                    height: 0.5,
                    comment: '',
                  };
                  setRegions((current) => [
                    ...current,
                    { ...region, geographicBounds: geographicBounds(target.element, region) },
                  ]);
                  setEditingId(region.id);
                  setEditText('');
                }}
              >
                Add region
              </Button>
              {listOpen ? (
                <div className="mt-2 max-h-44 space-y-1 overflow-auto border-t pt-2 text-xs">
                  {regions.length ? (
                    regions.map((region) => (
                      <button
                        className="block w-full truncate rounded p-1 text-left hover:bg-muted"
                        key={region.id}
                        onClick={() => {
                          setEditingId(region.id);
                          setEditText(region.comment);
                        }}
                        type="button"
                      >
                        {region.id} · {region.comment || 'Add a comment'}
                      </button>
                    ))
                  ) : (
                    <p className="text-muted-foreground">Drag over the surface to add a region.</p>
                  )}
                </div>
              ) : null}
              {regions.length && (allowDemoCapture || acceptsImages) ? (
                <Button
                  className="mt-2 w-full"
                  disabled={busy || !!editingId}
                  onClick={() => void send()}
                  size="sm"
                  type="button"
                >
                  <SendIcon aria-hidden="true" className="size-3.5" />
                  {busy
                    ? 'Capturing…'
                    : `Add ${regions.length} ${regions.length === 1 ? 'region' : 'regions'} to message`}
                </Button>
              ) : null}
              {attention && regions.length ? (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="outline"
                    type="button"
                    disabled={busy || !!editingId}
                    onClick={() =>
                      void (async () => {
                        setError('');
                        setBusy(true);
                        try {
                          const image = target.element.querySelector('img');
                          const query = target.reference?.().query as
                            | { sourceRef?: string }
                            | undefined;
                          if (!image || !query?.sourceRef)
                            throw new Error(
                              'For data views, select rows or points and use More → Add selection to attention set. Image regions require a referenced image.',
                            );
                          if (regions.length > 32)
                            throw new Error('Select at most 32 image regions.');
                          for (const region of regions)
                            await attention.image(
                              target.componentId,
                              query.sourceRef,
                              imageAttentionRegion(
                                image,
                                target.element,
                                displayedRegion(target.element, region),
                              ),
                            );
                          close();
                        } catch (cause) {
                          setError(
                            cause instanceof Error ? cause.message : 'Could not add image regions.',
                          );
                        } finally {
                          setBusy(false);
                        }
                      })()
                    }
                  >
                    Add to attention set
                  </Button>
                  <InfoTip label="About image attention">
                    Keeps the image region and recorded source. Heat is available only when the
                    capture includes a verified image-patch mapping.
                  </InfoTip>
                </div>
              ) : null}
              {error ? (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            {editorRegion ? (
              <div
                className="fixed z-40 max-h-[calc(100dvh-1rem)] w-[min(26rem,calc(100vw-1rem))] overflow-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
                data-capture-ui="true"
                style={{
                  left: clamp(
                    bounds.left +
                      (displayedRegion(target.element, editorRegion).x +
                        displayedRegion(target.element, editorRegion).width) *
                        bounds.width -
                      260,
                    8,
                    Math.max(8, window.innerWidth - 424),
                  ),
                  top: clamp(
                    bounds.top +
                      (displayedRegion(target.element, editorRegion).y +
                        displayedRegion(target.element, editorRegion).height) *
                        bounds.height +
                      12,
                    8,
                    Math.max(8, window.innerHeight - 340),
                  ),
                }}
              >
                <p className="mb-2 text-sm font-semibold">
                  {editorRegion.id} · {target.title}
                </p>
                <RegionCoordinateInputs
                  box={displayedRegion(target.element, editorRegion)}
                  onChange={(box) =>
                    setRegions((current) =>
                      current.map((region) =>
                        region.id === editorRegion.id
                          ? {
                              ...region,
                              ...box,
                              geographicBounds: geographicBounds(target.element, box),
                            }
                          : region,
                      ),
                    )
                  }
                />
                <textarea
                  autoFocus
                  aria-label={`Comment for ${editorRegion.id}`}
                  className="min-h-28 w-full resize-y rounded-md border bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onChange={(event) => setEditText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setEditingId(undefined);
                    else if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      done();
                    }
                  }}
                  placeholder="What should the agent notice here?"
                  value={editText}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    aria-label={`Delete ${editorRegion.id}`}
                    className="mr-auto"
                    onClick={() => {
                      setRegions((current) =>
                        current.filter((region) => region.id !== editorRegion.id),
                      );
                      setEditingId(undefined);
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <DeleteIcon aria-hidden="true" className="size-4" />
                  </Button>
                  <Button onClick={() => setEditingId(undefined)} size="sm" variant="ghost">
                    Cancel
                  </Button>
                  <Button onClick={done} size="sm">
                    <CheckIcon aria-hidden="true" className="size-4" />
                    Done
                  </Button>
                </div>
              </div>
            ) : null}
          </>,
          target.element.closest('[data-slot="dialog-content"]') ?? document.body,
        )}
    </A2uiRegionCaptureContext.Provider>
  );
}
