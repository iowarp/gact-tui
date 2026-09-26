import { useQuery } from '@tanstack/react-query';
import { BoxIcon, ImageDownIcon, Link2Icon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
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
import { formatFieldValue } from './mesh-viewport-colormap';
import { MeshLegend, type MeshLegendState } from './mesh-viewport-legend';
import { composeSnapshot, saveBlob } from './mesh-viewport-snapshot';
import { parseFeaMesh, type MeshField, type ParsedFeaMesh } from './mesh-viewport-mesh';
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

export interface ClioMeshViewportProps {
  accessibility?: A2UIAccessibility;
  /** The resolved `camera` binding, and its writer when the producer bound it to a path. */
  camera?: unknown;
  setCamera?: (value: MeshCameraState) => void;
  field?: string;
  frame?: number;
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

/** An orbitable view of one registered mesh, colored, thresholded, and stepped by its fields. */
export function ClioMeshViewport({
  accessibility,
  camera,
  setCamera,
  field,
  frame = 0,
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
  const bytes = useQuery({
    enabled: Boolean(artifactId),
    queryKey: queryKeys.key('artifact-mesh', settings.endpoint, artifactId),
    queryFn: ({ signal }) => repository.readArtifactBytes(artifactId!, undefined, signal),
    ...IMMUTABLE_QUERY,
  });
  const mesh = useQuery({
    enabled: Boolean(bytes.data),
    queryKey: queryKeys.key('artifact-mesh', settings.endpoint, artifactId, 'parsed'),
    queryFn: () => parseFeaMesh(bytes.data!),
    ...IMMUTABLE_QUERY,
  });
  const parsed = mesh.data;
  const webgl = useMemo(() => supportsWebGL(), []);

  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MeshViewportScene | undefined>(undefined);
  const [legend, setLegend] = useState<MeshLegendState>();
  const [visibleCells, setVisibleCells] = useState<number>();
  const [probe, setProbe] = useState<{ value?: number; x: number; y: number }>();
  const [snapshotError, setSnapshotError] = useState('');
  const instanceId = useId();
  const group = syncGroup || `solo:${instanceId}`;

  const colorField = parsed?.fields.find((candidate) => candidate.name === field);
  const cutField = parsed?.fields.find((candidate) => candidate.name === thresholdField);
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
  const setCameraRef = useRef(setCamera);

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
    const scene = new MeshViewportScene(node);
    sceneRef.current = scene;
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
    };
    const leave = joinMeshSyncGroup(group, member);
    return () => {
      window.clearTimeout(writeTimer);
      leave();
      memberRef.current = undefined;
      applyRef.current = undefined;
      resetRef.current = undefined;
      sceneRef.current = undefined;
      scene.dispose();
    };
  }, [group, instanceId, parsed, upAxis, webgl]);

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

  const heading = title || (parsed?.stage ? STAGE_LABEL[parsed.stage] : undefined) || 'Part';
  const description = describe(parsed, frameIndex, inputs, visibleCells, artifactId);
  const failure = !artifactId
    ? 'The mesh source is not a registered artifact id.'
    : bytes.isError
      ? bytes.error.message
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

  const saveSnapshot = () => {
    const scene = sceneRef.current;
    if (!scene) return;
    setSnapshotError('');
    composeSnapshot(scene.capture(), heading, description, legend)
      .then((blob) =>
        saveBlob(
          blob,
          `${slug(heading)}${frameCount > 1 ? `-${slug(parsed!.frames[frameIndex]!)}` : ''}.png`,
        ),
      )
      .catch((error: unknown) =>
        setSnapshotError(error instanceof Error ? error.message : String(error)),
      );
  };

  return (
    <div
      className="min-w-0"
      data-slot="a2ui-mesh-viewport"
      style={typeof weight === 'number' ? { flex: `${weight}`, minHeight: 0 } : undefined}
    >
      <Frame
        {...a2uiAccessibilityProps(accessibility)}
        aria-label={a2uiAccessibilityLabel(accessibility) ?? `${heading} 3D view`}
        dense
        role="group"
      >
        <FrameHeader className="flex-row items-center gap-2">
          <BoxIcon aria-hidden="true" className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <FrameTitle className="truncate">{heading}</FrameTitle>
            <FrameDescription>{description}</FrameDescription>
          </div>
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
          <HeaderAction disabled={!parsed || !webgl} label="Save image" onClick={saveSnapshot}>
            <ImageDownIcon aria-hidden="true" />
          </HeaderAction>
          <HeaderAction disabled={!parsed} label="Reset view" onClick={() => resetRef.current?.()}>
            <RetryIcon aria-hidden="true" />
          </HeaderAction>
        </FrameHeader>
        <FramePanel className="p-0">
          {failure ? (
            <p className="p-4 text-sm text-destructive">3D view unavailable: {failure}</p>
          ) : (
            <div
              aria-label={ariaSummary}
              className="relative h-80 min-h-64 overflow-hidden"
              onPointerLeave={() => setProbe(undefined)}
              onPointerMove={onPointerMove}
              ref={canvasRef}
              role="img"
            >
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
          {missing.length ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              This mesh has no {missing.join(' or ')} result, so that part of the view is off.
            </p>
          ) : null}
          {snapshotError ? (
            <p className="border-t px-3 py-2 text-xs text-destructive">
              The image was not saved: {snapshotError}
            </p>
          ) : null}
          {legend ? <MeshLegend legend={legend} /> : null}
        </FramePanel>
      </Frame>
    </div>
  );
}

function HeaderAction({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          size="icon-xs"
          variant="ghost"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
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
