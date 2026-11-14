import * as THREE from 'three';
import { useQuery } from '@tanstack/react-query';
import { BoxIcon, EyeOffIcon, FileBoxIcon, ImageIcon, LayersIcon, ScanIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from '@/hooks/use-repository';
import { keepEqualBytes } from '@/lib/keep-equal-bytes';
import { queryKeys } from '@/lib/query-keys';
import { VIEWER_BYTES_GC_TIME_MS } from '@/lib/runtime-limits';
import { resolveThemeColor, useThemeKey } from '@/theme/runtime';
import { plural, t, ph } from '@lingui/core/macro';
import { edgeColorForTheme, supportsWebGL } from './a2ui-mesh-view-state';
import { binaryStl, glbOf } from './cad-export';
import {
  boxSize,
  modelParts,
  partColors,
  shownBounds,
  standardViewFrame,
  upAxisOf,
  type StandardView,
} from './cad-view-model';
import { useFileViewerActions, type FileViewerAction } from './file-viewer-action-context';
import { useFileViewerFacts } from './file-viewer-facts';
import type { FileViewerSource } from './file-viewer-source';
import { parseMeshArtifact, type MeshFormat } from './mesh-viewport-formats';
import type { ParsedFeaMesh } from './mesh-viewport-mesh';
import { MeshViewportScene } from './mesh-viewport-scene';
import { composeSnapshot } from './mesh-viewport-snapshot';
import { fileName } from './resource-media-types';
import { ResourceLoading, ViewerNoPreview, ViewerReadError } from './resource-states';
import { downloadBlob, downloadBytes } from './surface-export';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';

const PALETTE_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'];

/** The theme's chart colours as linear RGB, the space three's vertex colours use. */
function themePalette(): [number, number, number][] {
  return PALETTE_TOKENS.map((token) => {
    const color = new THREE.Color().setStyle(resolveThemeColor(`var(${token})`));
    return [color.r, color.g, color.b];
  });
}

function stemOf(name: string) {
  return name.replace(/\.[^.]+$/u, '') || 'model';
}

/** A stable id per byte array, so a re-read with equal bytes (kept by identity) parses once. */
const bytesIds = new WeakMap<Uint8Array, number>();
let nextBytesId = 0;
function bytesId(bytes: Uint8Array) {
  let id = bytesIds.get(bytes);
  if (id === undefined) bytesIds.set(bytes, (id = nextBytesId += 1));
  return id;
}

/** A workspace CAD or mesh file, read whole like a PDF or an image. */
export function WorkspaceCadView({
  workspaceId,
  path,
  format,
  source,
}: {
  workspaceId: string;
  path: string;
  format: MeshFormat;
  source: FileViewerSource;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const content = useQuery({
    queryKey: queryKeys.workspaceFileBytes(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFileBytes(workspaceId, path, signal),
    gcTime: VIEWER_BYTES_GC_TIME_MS,
    structuralSharing: keepEqualBytes,
  });
  return (
    <CadFileView
      bytes={content.data}
      error={content.error?.message}
      format={format}
      name={fileName(path)}
      onRetry={() => void content.refetch()}
      source={source}
    />
  );
}

/**
 * A CAD or mesh file (STEP, STL, 3MF, OBJ, PLY, glTF) as an orbitable 3D view: each part in
 * its own colour with a parts list, the model's size in millimetres in the frame bar, edges
 * over the faces, and standard views. The original bytes stay the download; STL, GLB and a
 * picture of the view are Export to… conversions.
 */
export function CadFileView({
  source,
  name,
  format,
  bytes,
  error,
  onRetry,
}: {
  source: FileViewerSource;
  name: string;
  format: MeshFormat;
  bytes?: Uint8Array;
  error?: string;
  onRetry?: () => void;
}) {
  const webgl = useMemo(() => supportsWebGL(), []);
  const model = useQuery({
    queryKey: ['cad-model', format, bytes ? bytesId(bytes) : 0],
    queryFn: () => parseMeshArtifact(bytes!, format),
    enabled: webgl && bytes !== undefined,
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  if (!webgl)
    return (
      <ViewerNoPreview
        source={source}
        title={t`3D view needs WebGL`}
        reason={t`This browser can't draw 3D graphics, so the model can't be shown here.`}
      />
    );
  if (error) return <ViewerReadError error={error} onRetry={onRetry} />;
  if (model.isError)
    return <ViewerReadError error={model.error.message} onRetry={() => void model.refetch()} />;
  if (!model.data) return <ResourceLoading label={t`Opening ${ph({ name })}`} />;
  return <CadModelView format={format} mesh={model.data} name={name} />;
}

function CadModelView({
  mesh,
  name,
  format,
}: {
  mesh: ParsedFeaMesh;
  name: string;
  format: MeshFormat;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<MeshViewportScene>();
  const theme = useThemeKey();
  const parts = useMemo(() => modelParts(mesh), [mesh]);
  const multipart = parts.length > 1;
  const up = upAxisOf(format);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  const [edges, setEdges] = useState(true);
  // The parts list opens beside a wide view and stays folded on a phone until asked for.
  const [partsOpen, setPartsOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 640,
  );
  // The palette follows the theme, so it is read again when the theme changes.
  const palette = useMemo(() => (theme ? themePalette() : themePalette()), [theme]);
  const colors = useMemo(() => partColors(mesh, palette), [mesh, palette]);
  // The scene reads base colours from what it draws; the parsed (cached) mesh stays as read.
  const shown = useMemo(() => ({ ...mesh, baseColors: colors }), [mesh, colors]);

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;
    const created = new MeshViewportScene(container);
    setScene(created);
    return () => {
      setScene(undefined);
      created.dispose();
    };
  }, []);
  useEffect(() => {
    if (!scene) return;
    // A new model starts whole, framed from the isometric view.
    scene.setMesh(shown, edgeColorForTheme());
    scene.frameBounds(shown.bounds, up);
  }, [scene, shown, up]);
  useEffect(() => {
    scene?.setView({ frame: 0, hiddenParts: hidden });
  }, [scene, hidden, shown]);
  useEffect(() => {
    scene?.setEdgesShown(edges);
  }, [scene, edges, shown]);
  useEffect(() => {
    scene?.setEdgeColor(edgeColorForTheme());
  }, [scene, theme]);

  const bounds = shownBounds(mesh, hidden);
  const [x, y, z] = boxSize(bounds ?? mesh.bounds);
  const sizeFact = t`${ph({ x })} × ${ph({ y })} × ${ph({ z })} mm`;
  const partsFact = multipart ? plural(parts.length, { one: '# part', other: '# parts' }) : '';
  useFileViewerFacts([sizeFact, partsFact].filter(Boolean));

  const look = (view: StandardView) => {
    if (!scene || !bounds) return;
    if (view === 'iso') return scene.frameBounds(bounds, up);
    const frame = standardViewFrame(view, up);
    scene.frameFrom(bounds, new THREE.Vector3(...frame.direction), new THREE.Vector3(...frame.up));
  };
  const stem = stemOf(name);
  const savePicture = useCallback(async () => {
    if (!scene) return;
    downloadBlob(await composeSnapshot(scene.capture(), name, sizeFact, undefined), `${stem}.png`);
  }, [name, scene, sizeFact, stem]);
  const actions = useMemo<FileViewerAction[]>(() => {
    const rows: FileViewerAction[] = [];
    if (format !== 'stl')
      rows.push({
        label: t`STL (binary)`,
        description: t`Every part's triangles, for a slicer`,
        kind: 'download',
        icon: FileBoxIcon,
        onSelect: () => downloadBytes(binaryStl(mesh, stem), 'model/stl', `${stem}.stl`),
      });
    if (format !== 'glb')
      rows.push({
        label: t`GLB`,
        description: t`The parts with their names and colours, for other 3D viewers`,
        kind: 'download',
        icon: BoxIcon,
        onSelect: async () =>
          downloadBytes(await glbOf(mesh, colors), 'model/gltf-binary', `${stem}.glb`),
      });
    rows.push({
      label: t`PNG image of this view`,
      kind: 'download',
      icon: ImageIcon,
      onSelect: savePicture,
    });
    rows.push({
      label: t`Show edges`,
      kind: 'view',
      selected: edges,
      icon: ScanIcon,
      onSelect: () => setEdges((value) => !value),
    });
    if (multipart)
      rows.push({
        label: t`Parts list`,
        kind: 'view',
        selected: partsOpen,
        icon: LayersIcon,
        onSelect: () => setPartsOpen((value) => !value),
      });
    return rows;
  }, [colors, edges, format, mesh, multipart, partsOpen, savePicture, stem]);
  useFileViewerActions(actions);

  const toggle = (index: number) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const views: [StandardView, string][] = [
    ['iso', t`Isometric`],
    ['top', t`Top`],
    ['front', t`Front`],
    ['right', t`Right`],
  ];
  return (
    <div className="relative size-full min-h-0 overflow-hidden bg-muted/40" data-slot="cad-view">
      <ViewerToolbarContent>
        <ToolbarAction label={t`Fit to view`} onClick={() => bounds && scene?.fit(bounds)}>
          <ScanIcon aria-hidden="true" />
        </ToolbarAction>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarAction label={t`Standard views`}>
              <BoxIcon aria-hidden="true" />
            </ToolbarAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {views.map(([view, label]) => (
              <DropdownMenuItem key={view} onSelect={() => look(view)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ViewerToolbarContent>
      <div
        ref={canvasRef}
        aria-label={t`3D view of ${ph({ name })}, ${ph({ size: sizeFact })}. Drag to orbit, right-drag to pan, scroll or pinch to zoom.`}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        role="img"
      />
      {multipart && partsOpen ? (
        <section
          aria-label={t`Parts`}
          className="absolute top-2 left-2 max-h-[calc(100%-1rem)] w-56 max-w-[calc(100%-1rem)] overflow-auto rounded-md border bg-popover/95 p-1 text-sm text-popover-foreground shadow-sm"
          data-slot="cad-parts"
        >
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <h3 className="text-caption font-medium text-muted-foreground">
              {plural(parts.length, { one: '# part', other: '# parts' })}
            </h3>
            {hidden.size ? (
              <Button
                className="h-6 px-1.5 text-caption"
                onClick={() => setHidden(new Set())}
                size="sm"
                variant="ghost"
              >
                {t`Show all`}
              </Button>
            ) : null}
          </div>
          <ul>
            {parts.map((part, index) => {
              const name = part.name || t`Part ${ph({ number: index + 1 })}`;
              const swatch = new THREE.Color(
                colors[part.vertexStart * 3],
                colors[part.vertexStart * 3 + 1],
                colors[part.vertexStart * 3 + 2],
              );
              const off = hidden.has(index);
              return (
                <li key={`${index}-${name}`}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent">
                    <Checkbox
                      aria-label={off ? t`Show ${ph({ name })}` : t`Hide ${ph({ name })}`}
                      checked={!off}
                      onCheckedChange={() => toggle(index)}
                    />
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-sm border"
                      style={{ backgroundColor: `#${swatch.getHexString()}` }}
                    />
                    <span
                      className={
                        off ? 'min-w-0 truncate text-muted-foreground' : 'min-w-0 truncate'
                      }
                    >
                      {name}
                    </span>
                    {off ? (
                      <span className="ml-auto flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
                        <EyeOffIcon aria-hidden="true" className="size-3" />
                        {t`Hidden`}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
