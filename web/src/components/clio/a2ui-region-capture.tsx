import {
  displayedRegion,
  geographicBounds,
  mapSurface,
  type CaptureSurface,
  type CaptureTarget,
  type Region,
} from './a2ui-region-evidence';
export type { CaptureSurface } from './a2ui-region-evidence';
import { attachCommentSession } from './comments/comment-model';
import { a2uiAttachment } from './comments/a2ui-attachment';
import { getFontEmbedCSS, toCanvas } from 'html-to-image';
import { isAppFrame, paintAppFrames } from './a2ui-app-capture';
import { CommentControls } from './comments/comment-controls';
import { CommentEditor, type ScreenBox } from './comments/comment-editor';
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
import { imageAttentionRegion } from '@/lib/a2ui/attention-selection-coordinates';
import { InfoTip } from './info-tip';
import { mapPngBlob } from './map-export';
import type { MapDebugSurface } from './scientific-map-view';
import { readThemeColor, readThemeFont } from '@/theme/runtime';
import { isTransparentColor } from './surface-export';

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

/** A region shown on the surface, in client pixels: where its editor opens. */
function screenBox(bounds: DOMRect, region: Omit<Region, 'id' | 'comment'>): ScreenBox {
  return {
    left: bounds.left + region.x * bounds.width,
    top: bounds.top + region.y * bounds.height,
    width: region.width * bounds.width,
    height: region.height * bounds.height,
  };
}

function regionRect(region: Region, bounds: DOMRect): CSSProperties {
  return {
    left: region.x * bounds.width,
    top: region.y * bounds.height,
    width: region.width * bounds.width,
    height: region.height * bounds.height,
  };
}

async function labelledPng(
  target: HTMLElement,
  regions: readonly Region[],
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2),
): Promise<Blob> {
  // A part still loading shows a placeholder; a capture of it would show the agent nothing.
  if (target.querySelector('[aria-busy="true"]'))
    throw new Error('Part of this view is still loading. Try again when it has loaded.');
  let background: Element | null = target;
  let backgroundColor = readThemeColor('background');
  while (background) {
    const color = getComputedStyle(background).backgroundColor;
    if (!isTransparentColor(color)) {
      backgroundColor = color;
      break;
    }
    background = background.parentElement;
  }
  // SVG foreignObject uses classic scrollbars even when the live browser uses
  // overlay scrollbars. Their added height otherwise covers the last table
  // row. Clip the same column viewport without drawing clone-only scrollbars;
  // keep this styling in the export so the live table remains scrollable.
  const fontEmbedCSS = `${await getFontEmbedCSS(target)}
    [data-slot="data-grid"] [role="region"],
    [data-slot="clio-data-grid-viewport"] { overflow: hidden !important; }
  `;
  const canvas = await toCanvas(target, {
    // Reference images use immutable blob URLs. Appending a cache-busting query
    // makes those URLs invalid, so capture must preserve their exact identity.
    cacheBust: false,
    includeQueryParams: true,
    fetchRequestInit: { cache: 'no-store' },
    backgroundColor,
    fontEmbedCSS,
    // Canvases and app frames are painted below from their live pixels; a cloned copy
    // would sit beside the live one (a chart drawn twice) or stay blank (an app frame).
    filter: (node) =>
      node.nodeType !== Node.ELEMENT_NODE ||
      !(
        (node as Element).getAttribute('data-slot') === 'surface-toolbar' ||
        (node as Element).getAttribute('data-capture-ui') === 'true' ||
        node instanceof HTMLCanvasElement ||
        isAppFrame(node as Element)
      ),
    pixelRatio,
  });
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not create an image drawing context.');
  const scaleX = canvas.width / target.getBoundingClientRect().width;
  const scaleY = canvas.height / target.getBoundingClientRect().height;
  const targetRect = target.getBoundingClientRect();
  const mapCanvases = new Set<HTMLCanvasElement>();
  // The capture target can be the map surface itself, which querySelectorAll never returns.
  const mapSelector = '[data-slot="a2ui-map-surface"]';
  const mapElements = [
    ...(target.matches(mapSelector) ? [target as MapDebugSurface] : []),
    ...target.querySelectorAll<MapDebugSurface>(mapSelector),
  ];
  for (const mapElement of mapElements) {
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
      cacheBust: false,
      includeQueryParams: true,
      fetchRequestInit: { cache: 'no-store' },
      backgroundColor: 'transparent',
      pixelRatio,
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
  await paintAppFrames(context, target, scaleX, scaleY);
  context.lineWidth = Math.max(2, 2 * scaleX);
  context.font = `bold ${Math.round(14 * scaleX)}px ${readThemeFont('typeface-ui')}`;
  const accent = readThemeColor('primary');
  const onAccent = readThemeColor('primary-foreground');
  for (const region of regions) {
    const shown = displayedRegion(target, region);
    const x = shown.x * canvas.width;
    const y = shown.y * canvas.height;
    const width = shown.width * canvas.width;
    const height = shown.height * canvas.height;
    context.strokeStyle = accent;
    context.strokeRect(x, y, width, height);
    const badgeWidth = Math.max(34 * scaleX, context.measureText(region.id).width + 14 * scaleX);
    const badgeHeight = 24 * scaleY;
    context.fillStyle = accent;
    context.fillRect(x, Math.max(0, y - badgeHeight), badgeWidth, badgeHeight);
    context.fillStyle = onAccent;
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
export async function captureRenderedSurfacePng(
  target: HTMLElement,
  pixelRatio?: number,
): Promise<Blob> {
  return labelledPng(target, [], pixelRatio);
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
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [controlPosition, setControlPosition] = useState<{ x: number; y: number }>();
  const nextId = useRef(1);
  const dragStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const draftRef = useRef<Region | undefined>(undefined);
  const start = useCallback(
    (next: CaptureTarget) => {
      if (!allowed) return;
      window.getSelection()?.removeAllRanges();
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
        // Room for the controls with their whole-dashboard choice (FP-D6).
        y: clamp(rect.top + 56, 8, window.innerHeight - (next.wider ? 150 : 90)),
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
    setDraft(undefined);
  };
  const close = () => {
    setTarget(undefined);
    setRegions([]);
    setSelecting(false);
    setEditingId(undefined);
    setError('');
  };
  const send = async () => {
    if (!target || !regions.length || busy) return;
    setBusy(true);
    setError('');
    try {
      attachCommentSession(await a2uiAttachment(surface, target, regions, labelledPng));
      // Attaching does not end Select mode. The person can add more labelled regions
      // until they turn Select off or send the message.
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
                  className="absolute border-2 border-primary bg-primary/10 text-left"
                  key={region.id}
                  onClick={() => setEditingId(region.id)}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={{ ...regionRect(shown, bounds), pointerEvents: 'auto' }}
                  type="button"
                >
                  <span
                    className="absolute rounded-t bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground"
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
            <CommentControls
              addRegionDisabled={regions.length >= 32}
              busy={busy}
              error={error}
              hint="Drag over the surface to add a region."
              initialPosition={controlPosition}
              key={controlPosition ? `${controlPosition.x}:${controlPosition.y}` : 'controls'}
              marks={regions.map((region) => ({ label: region.id, comment: region.comment }))}
              onAddRegion={() => {
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
              }}
              onClose={close}
              onOpenMark={setEditingId}
              onSend={() => void send()}
              onToggleSelect={() => setSelecting((active) => !active)}
              selecting={selecting}
              sendDisabled={!!editingId}
              sendLabel={
                allowDemoCapture || acceptsImages
                  ? `Add ${regions.length} ${regions.length === 1 ? 'mark' : 'marks'} to message`
                  : undefined
              }
              title={target.title}
            >
              {target.wider && !regions.length ? (
                <Button
                  className="mt-2 w-full"
                  data-capture-wider="true"
                  onClick={() => target.wider && start(target.wider)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Mark across the whole dashboard
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
            </CommentControls>
            {editorRegion ? (
              <CommentEditor
                comment={editorRegion.comment}
                coordinates={{
                  box: displayedRegion(target.element, editorRegion),
                  onChange: (box) =>
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
                    ),
                }}
                key={editorRegion.id}
                label={editorRegion.id}
                near={screenBox(bounds, displayedRegion(target.element, editorRegion))}
                onCancel={() => setEditingId(undefined)}
                onDelete={() => {
                  setRegions((current) =>
                    current.filter((region) => region.id !== editorRegion.id),
                  );
                  setEditingId(undefined);
                }}
                onDone={(comment) => {
                  setRegions((current) =>
                    current.map((region) =>
                      region.id === editorRegion.id ? { ...region, comment } : region,
                    ),
                  );
                  setEditingId(undefined);
                }}
                title={target.title}
              />
            ) : null}
          </>,
          target.element.closest('[data-slot="dialog-content"]') ?? document.body,
        )}
    </A2uiRegionCaptureContext.Provider>
  );
}
