import { useQuery } from '@tanstack/react-query';
import { Link2Icon, MousePointerSquareDashedIcon, ZoomInIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useRepository } from '@/hooks/use-repository';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { IMMUTABLE_QUERY } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { formatFieldValue } from './mesh-viewport-colormap';
import { MeshLegend, type MeshLegendState } from './mesh-viewport-legend';
import { composeSnapshot } from './mesh-viewport-snapshot';
import { parsedMeshCache } from './mesh-viewport-cache';
import { type MeshField, type ParsedFeaMesh } from './mesh-viewport-mesh';
import { parseMeshArtifact, type MeshFormat } from './mesh-viewport-formats';
import { MeshViewportScene, type MeshUpAxis } from './mesh-viewport-scene';
import {
  joinMeshSyncGroup,
  meshGroupBounds,
  meshGroupRange,
  publishMeshCamera,
  updateMeshSyncMember,
  type MeshCameraState,
  type MeshSyncMember,
} from './mesh-viewport-sync';
import { downloadBlob, downloadBytes, filenameStemFromTitle } from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import {
  SurfaceToolbar,
  type SurfaceCapabilities,
  type SurfaceExportFormat,
} from './surface-toolbar';

export interface ClioMeshViewportProps {
  accessibility?: A2UIAccessibility;
  componentId?: string;
  /** The resolved `camera` binding, and its writer when the producer bound it to a path. */
  camera?: unknown;
  setCamera?: (value: MeshCameraState) => void;
  field?: string;
  format?: MeshFormat;
  frame?: number;
  materialUri?: string;
  meshUri: string;
  showField?: boolean;
  syncGroup?: string;
  thresholdField?: string;
  thresholdMax?: number;
  thresholdMin?: number;
  title?: string;
  upAxis?: MeshUpAxis;
  /** Flex weight inside a Row/Column, as the Basic catalog components apply it. */
  weight?: number;
}

interface ViewInputs {
  color?: MeshField;
  threshold?: { field: MeshField; min: number; max: number };
  frame: number;
}

function artifactIdFromMeshUri(uri: string): string | undefined {
  return /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(uri)?.[1];
}

function isCameraState(value: unknown): value is MeshCameraState {
  if (!value || typeof value !== 'object') return false;
  const { position, target } = value as Partial<MeshCameraState>;
  const vector = (v: unknown) =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n));
  return vector(position) && vector(target);
}

const STAGE_LABEL: Record<string, string> = {
  baseline: 'Before optimization',
  optimized: 'After optimization',
};

const MESH_MIME_TYPE: Record<MeshFormat, string> = {
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'model/obj', stl: 'model/stl',
  ply: 'application/octet-stream', fbx: 'application/octet-stream', '3mf': 'model/3mf',
  vtk: 'application/octet-stream', vtp: 'application/xml', drc: 'application/octet-stream',
};

/** An orbitable view of one registered mesh, colored, thresholded, and stepped by its fields. */
export function ClioMeshViewport({
  accessibility,
  componentId,
  camera,
  setCamera,
  field,
  format,
  frame = 0,
  materialUri,
  meshUri,
  showField,
  syncGroup,
  thresholdField,
  thresholdMax,
  thresholdMin,
  title,
  upAxis = 'y',
  weight,
}: ClioMeshViewportProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifactId = artifactIdFromMeshUri(meshUri);
  const materialArtifactId = materialUri ? artifactIdFromMeshUri(materialUri) : undefined;
  // The raw bytes are parsed and dropped; only the parsed mesh is kept, in the
  // byte-budgeted LRU (`mesh-viewport-cache.ts`), never in the query cache.
  const mesh = useQuery({
    enabled: Boolean(artifactId),
    queryKey: queryKeys.key('artifact-mesh', settings.endpoint, artifactId, format, materialArtifactId),
    queryFn: async ({ signal }) => {
      const key = `${settings.endpoint}|${artifactId}|${format ?? 'auto'}|${materialArtifactId ?? ''}`;
      const cached = parsedMeshCache.get(key);
      if (cached) return cached;
      if (materialUri && !materialArtifactId) throw new Error('materialUri must name a registered artifact.');
      const [bytes, materialBytes] = await Promise.all([
        repository.readArtifactBytes(artifactId!, undefined, signal),
        materialArtifactId ? repository.readArtifactBytes(materialArtifactId, undefined, signal) : Promise.resolve(undefined),
      ]);
      const parsedMesh = await parseMeshArtifact(bytes, format, materialBytes);
      parsedMeshCache.set(key, parsedMesh);
      return parsedMesh;
    },
    ...IMMUTABLE_QUERY,
    gcTime: 0,
  });
  const parsed = mesh.data;
  const webgl = useMemo(() => supportsWebGL(), []);

  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MeshViewportScene | undefined>(undefined);
  const [legend, setLegend] = useState<MeshLegendState>();
  const [visibleCells, setVisibleCells] = useState<number>();
  const [probe, setProbe] = useState<{ value?: number; x: number; y: number }>();
  const [snapshotError, setSnapshotError] = useState('');
  const [boxMode, setBoxMode] = useState(false);
  const [zoomActive, setZoomActive] = useState(false);
  const [nodeSelection, setNodeSelection] = useState<{ meshUri: string; ids: number[] }>();
  const selectedNodes = useMemo(
    () => nodeSelection?.meshUri === meshUri ? nodeSelection.ids : [],
    [meshUri, nodeSelection],
  );
  const [draftBox, setDraftBox] = useState<{ x0: number; y0: number; x1: number; y1: number }>();
  const dragStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const instanceId = useId();
  const group = syncGroup || `solo:${instanceId}`;

  const colorField = parsed?.fields.find((candidate) => candidate.name === field);
  const namedCutField = parsed?.fields.find((candidate) => candidate.name === thresholdField);
  // A cells export thresholds whole elements, which needs one value per
  // element; a per-node field there is refused with a stated reason below.
  const thresholdNeedsCells =
    parsed?.topology === 'cells' && namedCutField?.location === 'node' ? namedCutField : undefined;
  const cutField = thresholdNeedsCells ? undefined : namedCutField;
  const frameCount = parsed?.frames.length ?? 0;
  const frameIndex = Math.min(Math.max(0, Math.round(frame)), Math.max(0, frameCount - 1));
  const inputs = useMemo<ViewInputs>(
    () => ({
      color: showField !== false ? colorField : undefined,
      threshold: cutField
        ? {
            field: cutField,
            min: typeof thresholdMin === 'number' ? thresholdMin : Number.NEGATIVE_INFINITY,
            max: typeof thresholdMax === 'number' ? thresholdMax : Number.POSITIVE_INFINITY,
          }
        : undefined,
      frame: frameIndex,
    }),
    [colorField, cutField, frameIndex, showField, thresholdMax, thresholdMin],
  );
  const inputsRef = useRef<ViewInputs>({ frame: 0 });
  const memberRef = useRef<MeshSyncMember | undefined>(undefined);
  const applyRef = useRef<(() => void) | undefined>(undefined);
  const resetRef = useRef<(() => void) | undefined>(undefined);
  const lastCameraRef = useRef('');
  const localCameraRef = useRef<{ meshUri: string; state: MeshCameraState } | undefined>(undefined);
  const setCameraRef = useRef(setCamera);
  // Declared before the scene effect (not where it's first READ, further
  // down) so the effect's dependency array below can force a fresh scene on
  // every fullscreen toggle -- see that effect's own comment for why.
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();

  // Declared before the scene effect so a new scene starts from the current inputs.
  useEffect(() => {
    const colorChanged = inputsRef.current.color !== inputs.color;
    inputsRef.current = inputs;
    const member = memberRef.current;
    if (!member) return;
    if (colorChanged) {
      member.range = rangeOf(inputs.color);
      updateMeshSyncMember(group);
    } else {
      applyRef.current?.();
    }
  }, [group, inputs]);

  // One scene per parsed mesh and group; field, threshold, and frame only update it.
  useEffect(() => {
    const node = canvasRef.current;
    if (!node || !parsed || !webgl) return;
    const restoredCamera = localCameraRef.current?.meshUri === meshUri ? localCameraRef.current.state : undefined;
    const scene = new MeshViewportScene(node);
    sceneRef.current = scene;
    const captureNode = node as HTMLDivElement & {
      __clioMeshCapture?: () => HTMLCanvasElement;
      __clioMeshInspect?: (box: { left: number; top: number; right: number; bottom: number }) => { count: number; nodeIds: number[]; nodesTruncated: boolean };
    };
    captureNode.__clioMeshCapture = () => scene.capture();
    captureNode.__clioMeshInspect = (box) => {
      const nodeIds = scene.nodesInScreenBox(box);
      return { count: nodeIds.length, nodeIds: nodeIds.slice(0, 100), nodesTruncated: nodeIds.length > 100 };
    };
    scene.setMesh(parsed, edgeColorForTheme());
    let userMoved = false;
    let writeTimer = 0;
    const apply = () => {
      const current = inputsRef.current;
      const range = current.color ? meshGroupRange(group, current.color.name) : undefined;
      const selection = scene.setView({
        color: current.color && range ? { field: current.color, ...range } : undefined,
        threshold: current.threshold,
        frame: current.frame,
      });
      setVisibleCells(current.threshold ? selection?.visibleCells : undefined);
      setLegend(
        current.color && range
          ? { field: current.color, min: range.min, max: range.max, sharedWith: range.members - 1 }
          : undefined,
      );
    };
    // Keep the data model's camera current (debounced), whoever moved the view.
    const writeCamera = () => {
      localCameraRef.current = { meshUri, state: scene.cameraState() };
      window.clearTimeout(writeTimer);
      writeTimer = window.setTimeout(() => {
        const state = scene.cameraState();
        lastCameraRef.current = JSON.stringify(state);
        setCameraRef.current?.(state);
      }, 250);
    };
    const frame = () => {
      scene.frameBounds(meshGroupBounds(group) ?? parsed.bounds, upAxis);
      writeCamera();
    };
    const member: MeshSyncMember = {
      id: instanceId,
      bounds: parsed.bounds,
      range: rangeOf(inputsRef.current.color),
      applyCamera: (state) => {
        userMoved = true;
        scene.applyCamera(state);
        writeCamera();
      },
      groupChanged: () => {
        if (!userMoved) frame();
        apply();
      },
    };
    memberRef.current = member;
    applyRef.current = apply;
    scene.onCameraChange = (state) => {
      userMoved = true;
      publishMeshCamera(group, member, state);
      writeCamera();
    };
    resetRef.current = () => {
      userMoved = false;
      frame();
      publishMeshCamera(group, member, scene.cameraState());
      setZoomActive(false);
    };
    const leave = joinMeshSyncGroup(group, member);
    if (restoredCamera) {
      scene.applyCamera(restoredCamera);
      localCameraRef.current = { meshUri, state: restoredCamera };
    }
    return () => {
      window.clearTimeout(writeTimer);
      leave();
      memberRef.current = undefined;
      applyRef.current = undefined;
      resetRef.current = undefined;
      sceneRef.current = undefined;
      delete captureNode.__clioMeshCapture;
      delete captureNode.__clioMeshInspect;
      scene.dispose();
    };
    // `fullscreen` forces a fresh scene (and WebGL context) on every toggle:
    // `SurfaceFullScreenHost` moves this canvas between two portal targets
    // (inline vs. dialog) rather than remounting the React tree, so this
    // effect's other deps alone would never re-run on that move and the
    // scene stayed bound to whichever container it was first created in.
  }, [fullscreen, group, instanceId, meshUri, parsed, upAxis, webgl]);

  useEffect(() => {
    sceneRef.current?.highlightNodes(selectedNodes);
  }, [fullscreen, inputs, parsed, selectedNodes]);

  // A camera written into the data model by the producer (or another view) moves this view.
  useEffect(() => {
    setCameraRef.current = setCamera;
  }, [setCamera]);
  useEffect(() => {
    const scene = sceneRef.current;
    const member = memberRef.current;
    if (!scene || !member || !isCameraState(camera)) return;
    const key = JSON.stringify(camera);
    if (key === lastCameraRef.current) return;
    lastCameraRef.current = key;
    member.applyCamera(camera);
    publishMeshCamera(group, member, camera);
  }, [camera, group, parsed]);

  const probeFrame = useRef(0);
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 0) {
      setProbe(undefined);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (probeFrame.current) cancelAnimationFrame(probeFrame.current);
    probeFrame.current = requestAnimationFrame(() => {
      probeFrame.current = 0;
      const hit = sceneRef.current?.probe(
        x,
        y,
        inputsRef.current.color ?? inputsRef.current.threshold?.field,
      );
      setProbe(hit?.value !== undefined && Number.isFinite(hit.value) ? hit : undefined);
    });
  };
  const probeField = inputs.color ?? inputs.threshold?.field;

  const boxPoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const onBoxPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragStart.current = boxPoint(event);
    setDraftBox({ x0: dragStart.current.x, y0: dragStart.current.y, x1: dragStart.current.x, y1: dragStart.current.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onBoxPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const point = boxPoint(event);
    setDraftBox({ x0: dragStart.current.x, y0: dragStart.current.y, x1: point.x, y1: point.y });
  };
  const onBoxPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    dragStart.current = undefined;
    setDraftBox(undefined);
    if (!start) return;
    const end = boxPoint(event);
    const rect = event.currentTarget.getBoundingClientRect();
    if (Math.abs(end.x - start.x) * rect.width < 6 || Math.abs(end.y - start.y) * rect.height < 6) return;
    const nodes = sceneRef.current?.nodesInScreenBox({
      left: Math.min(start.x, end.x) * rect.width,
      top: Math.min(start.y, end.y) * rect.height,
      right: Math.max(start.x, end.x) * rect.width,
      bottom: Math.max(start.y, end.y) * rect.height,
    }) ?? [];
    setNodeSelection({ meshUri, ids: nodes });
  };

  const heading = title || (parsed?.stage ? STAGE_LABEL[parsed.stage] : undefined) || 'Part';
  const description = describe(parsed, frameIndex, inputs, visibleCells, artifactId);
  const failure = !artifactId
    ? 'The mesh source is not a registered artifact id.'
    : mesh.isError
      ? mesh.error.message
      : !webgl
        ? 'this browser cannot draw 3D graphics (WebGL is off).'
        : '';
  const missing = [
    parsed && field && !colorField ? `“${field}”` : '',
    parsed && thresholdField && !cutField ? `“${thresholdField}”` : '',
  ].filter(Boolean);
  const ariaSummary = legend
    ? `${heading}, colored by ${legend.field.label} from ${formatFieldValue(legend.min)} to ${formatFieldValue(legend.max)} ${legend.field.unit}`
    : `${heading}, geometry only`;

  const exportFormats: SurfaceExportFormat[] = [
    {
      disabled: !parsed || !webgl,
      id: 'png',
      label: 'PNG snapshot',
      run: async () => {
        const scene = sceneRef.current;
        if (!scene) return;
        setSnapshotError('');
        try {
          const blob = await composeSnapshot(scene.capture(), heading, description, legend);
          downloadBlob(
            blob,
            `${slug(heading)}${frameCount > 1 ? `-${slug(parsed!.frames[frameIndex]!)}` : ''}.png`,
          );
        } catch (error) {
          setSnapshotError(error instanceof Error ? error.message : String(error));
        }
      },
    },
    {
      disabled: !artifactId,
      id: 'original',
      label: 'Original file',
      run: async () => {
        if (!artifactId) return;
        const bytes = await repository.readArtifactBytes(artifactId);
        const extension = (parsed?.sourceFormat ?? format ?? 'glb') as MeshFormat;
        downloadBytes(bytes, MESH_MIME_TYPE[extension], `${filenameStemFromTitle(heading)}.${extension}`);
      },
    },
  ];

  const buildReference = (): DataZoneReference => {
    const colorLabel = inputs.color ? `colored by ${inputs.color.label}` : 'geometry only';
    const frameLabel = frameCount > 1 ? parsed?.frames[frameIndex] : undefined;
    return buildZoneReference({
      componentLabel: heading,
      datasetLabel: artifactId ?? meshUri,
      filters: [],
      previewColumns: [],
      previewRows: [],
      query: { field, frame: frameIndex, meshUri, format: parsed?.sourceFormat ?? format, materialUri, thresholdField, thresholdMax, thresholdMin, ...(selectedNodes.length ? { selection: { field: 'node', values: selectedNodes } } : {}) },
      zoneDescription: selectedNodes.length
        ? `${selectedNodes.length} selected mesh ${selectedNodes.length === 1 ? 'node' : 'nodes'}`
        : `the current view, ${[colorLabel, frameLabel].filter(Boolean).join(', ')}`,
    });
  };

  const toolbarCapabilities: SurfaceCapabilities = {
    captureComponentId: componentId,
    buildReference: parsed ? buildReference : undefined,
    onReferenced: () => setBoxMode(false),
    exportFormats,
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    overflowContent: (
      <>
        <DropdownMenuItem disabled={!parsed} onSelect={() => resetRef.current?.()}>
          <RetryIcon aria-hidden="true" />
          Reset view
        </DropdownMenuItem>
        <DropdownMenuItem
          className="max-w-72 whitespace-normal text-xs text-muted-foreground"
          disabled
          onSelect={(event) => event.preventDefault()}
        >
          {description}
        </DropdownMenuItem>
      </>
    ),
  };

  const boxButton = () => parsed && webgl ? <Tooltip>
    <TooltipTrigger asChild>
      <Button aria-label="Box select mesh nodes" aria-pressed={boxMode} className={`shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100 ${boxMode ? 'opacity-100' : ''}`} onClick={() => setBoxMode((active) => !active)} size="icon-sm" variant={boxMode ? 'secondary' : 'ghost'}>
        <MousePointerSquareDashedIcon aria-hidden="true" className="size-3.5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">Drag a rectangle to select mesh nodes. Click again to orbit.</TooltipContent>
  </Tooltip> : null;
  const zoomButtons = () => <>
    {selectedNodes.length ? <Button aria-label="Zoom to selection" onClick={() => {
      const scene = sceneRef.current;
      if (scene?.frameNodes(selectedNodes, upAxis)) {
        setZoomActive(true);
        const member = memberRef.current;
        if (member) publishMeshCamera(group, member, scene.cameraState());
        localCameraRef.current = { meshUri, state: scene.cameraState() };
      }
    }} size="icon-sm" title="Zoom to selection" variant="ghost"><ZoomInIcon aria-hidden="true" className="size-3.5" /></Button> : null}
    {zoomActive ? <Button aria-label="Reset zoom" onClick={() => resetRef.current?.()} size="icon-sm" title="Reset zoom" variant="ghost"><RetryIcon aria-hidden="true" className="size-3.5" /></Button> : null}
  </>;

  return (
    <div
      className="min-w-0"
      data-slot="a2ui-mesh-viewport"
      style={typeof weight === 'number' ? { flex: `${weight}`, minHeight: 0 } : undefined}
    >
      <section
        {...a2uiAccessibilityProps(accessibility)}
        aria-label={a2uiAccessibilityLabel(accessibility) ?? `${heading} 3D view`}
        className="group relative min-w-0"
        role="group"
      >
        <div className="mb-2 flex min-w-0 items-start gap-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{heading}</h3>
          {syncGroup ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label="Camera and color scale linked with other views"
                  className="inline-flex size-6 items-center justify-center text-muted-foreground"
                  role="img"
                >
                  <Link2Icon aria-hidden="true" className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Orbiting here moves every linked view, and they share one color scale.
              </TooltipContent>
            </Tooltip>
          ) : null}
          {boxButton()}
          {zoomButtons()}
          <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
        </div>
        <SurfaceFullScreenHost
          fullscreen={fullscreen}
          headerExtra={
            <>{boxButton()}{zoomButtons()}<SurfaceToolbar capabilities={{ ...toolbarCapabilities, fullScreen: undefined }} floating={false} /></>
          }
          onOpenChange={setFullscreen}
          title={heading}
        >
          <div className="min-w-0">
            {failure ? (
              <p className="p-4 text-sm text-destructive">3D view unavailable: {failure}</p>
            ) : (
              <div
                aria-label={ariaSummary}
                className={fullscreen ? 'relative h-[calc(100dvh-6rem)] min-h-64 overflow-hidden' : 'relative h-80 min-h-64 overflow-hidden'}
                onPointerLeave={() => setProbe(undefined)}
                onPointerMove={onPointerMove}
                ref={canvasRef}
                role="img"
              >
                {boxMode ? <div
                  aria-label="Drag to select mesh nodes"
                  className="absolute inset-0 z-10 cursor-crosshair"
                  onPointerDown={onBoxPointerDown}
                  onPointerMove={onBoxPointerMove}
                  onPointerUp={onBoxPointerUp}
                  role="presentation"
                  style={{ touchAction: 'none' }}
                >{draftBox ? <div className="pointer-events-none absolute border-2 border-cyan-400 bg-cyan-400/10" style={{ left: `${Math.min(draftBox.x0, draftBox.x1) * 100}%`, top: `${Math.min(draftBox.y0, draftBox.y1) * 100}%`, width: `${Math.abs(draftBox.x1 - draftBox.x0) * 100}%`, height: `${Math.abs(draftBox.y1 - draftBox.y0) * 100}%` }} /> : null}</div> : null}
                {!parsed ? (
                  <Skeleton
                    aria-label={`Loading ${heading} mesh`}
                    className="absolute inset-0 rounded-none motion-reduce:animate-none"
                  />
                ) : null}
                {probe && probeField ? (
                  <div
                    className="pointer-events-none absolute rounded-md border bg-popover px-2 py-1 font-mono text-xs text-popover-foreground shadow-sm"
                    style={{ left: probe.x + 12, top: probe.y + 12 }}
                  >
                    {probeField.label !== legend?.field.label ? `${probeField.label} ` : ''}
                    {formatFieldValue(probe.value ?? Number.NaN)} {probeField.unit}
                  </div>
                ) : null}
              </div>
            )}
            {thresholdNeedsCells ? (
              <p
                className="mt-2 border-t py-2 text-xs text-muted-foreground"
                data-reason="threshold_field_per_node"
              >
                {`“${thresholdNeedsCells.label}” is per-node; a threshold needs per-element values, so the threshold is off.`}
              </p>
            ) : null}
            {missing.length ? (
              <p className="mt-2 border-t py-2 text-xs text-muted-foreground">
                This mesh has no {missing.join(' or ')} result, so that part of the view is off.
              </p>
            ) : null}
            {parsed?.warnings?.map((warning) => (
              <p className="mt-2 border-t py-2 text-xs text-muted-foreground" key={warning}>{warning}</p>
            ))}
            {snapshotError ? (
              <p className="mt-2 border-t py-2 text-xs text-destructive">
                The image was not saved: {snapshotError}
              </p>
            ) : null}
            {selectedNodes.length ? <p className="mt-2 text-xs text-cyan-500">{selectedNodes.length} mesh {selectedNodes.length === 1 ? 'node' : 'nodes'} selected</p> : null}
            {legend ? <MeshLegend legend={legend} /> : null}
          </div>
        </SurfaceFullScreenHost>
      </section>
    </div>
  );
}

function describe(
  parsed: ParsedFeaMesh | undefined,
  frame: number,
  inputs: ViewInputs,
  visibleCells: number | undefined,
  artifactId: string | undefined,
): string {
  if (!parsed) return artifactId ? 'Loading mesh…' : 'Mesh unavailable';
  const parts: string[] = [];
  if (parsed.frames.length > 1) parts.push(parsed.frames[frame] ?? `Frame ${frame}`);
  const threshold = inputs.threshold;
  if (threshold && threshold.field.location === 'cell' && visibleCells !== undefined) {
    const bound = Number.isFinite(threshold.min)
      ? ` at ${threshold.field.label.toLowerCase()} ≥ ${formatFieldValue(threshold.min)}${threshold.field.unit ? ` ${threshold.field.unit}` : ''}`
      : '';
    parts.push(
      `${visibleCells.toLocaleString()} of ${parsed.cells.toLocaleString()} elements${bound}`,
    );
  } else if (parsed.topology === 'cells') {
    parts.push(`${parsed.cells.toLocaleString()} elements`);
  } else {
    parts.push(`${(parsed.triangles.length / 3).toLocaleString()} surface triangles`);
  }
  if (parsed.lengthUnit) parts.push(`units ${parsed.lengthUnit}`);
  return parts.join(', ');
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-|-$/gu, '') || 'view'
  );
}

/** Feature-edge color; three.js cannot parse the theme's oklch() tokens. */
function edgeColorForTheme(): string {
  return document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#1e293b';
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function rangeOf(field: MeshField | undefined) {
  return field ? { field: field.name, min: field.min, max: field.max } : undefined;
}
