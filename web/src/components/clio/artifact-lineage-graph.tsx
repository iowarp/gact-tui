import type { Artifact, ArtifactLineage, ArtifactVersion } from '@clio/core/v3';
import { TriangleAlertIcon, WrenchIcon } from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  canOpenLineageNode,
  fitLineageLayout,
  layoutArtifactLineage,
  layoutVersionChain,
  LINEAGE_NODE_HEIGHT,
  type LineageGraphLayout,
  type LineageGraphNode,
  type LineageSpread,
} from './artifact-lineage-layout';
import type { LineageActivity } from './artifact-lineage-view';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { useFileViewerFacts } from './file-viewer-facts';
import { GraphEdgeCues } from './graph-edge-fade';
import { fitWidth, usePaneSize, useScrollEdges } from './graph-fit';

/** The canvas's `p-3.5` inset around the drawing. Unit: CSS px. */
const LINEAGE_CANVAS_PADDING = 14;

/**
 * What the service recorded about one file, drawn as the spec's node graph.
 * The current node's stack unfolds into its versions; every other node opens
 * its file or its Activity row.
 */
export function ArtifactLineageGraph({
  artifact,
  lineage,
  versions,
  current,
  onOpenArtifact,
  onOpenActivity,
}: {
  artifact: Artifact;
  lineage: ArtifactLineage;
  versions?: readonly ArtifactVersion[];
  current?: number;
  onOpenArtifact?: (artifact: Artifact) => void;
  onOpenActivity?: (activity: LineageActivity) => void;
}) {
  const [unfolded, setUnfolded] = useState(false);
  const rootVersion = lineage.nodes.find((node) => node.id === lineage.root)?.['version'];
  const version = current ?? (typeof rootVersion === 'number' ? rootVersion : artifact.version);
  const earlier = version ? (versions ?? []).filter((entry) => entry.version < version).length : 0;
  const graph = useMemo(
    () => layoutArtifactLineage(artifact, lineage, { earlier }),
    [artifact, lineage, earlier],
  );
  const chained = Boolean(unfolded && version && versions?.length);
  const build = useCallback(
    (spread: LineageSpread) =>
      chained && version && versions
        ? layoutVersionChain(artifact, versions, version, undefined, spread)
        : layoutArtifactLineage(artifact, lineage, { earlier, spread }),
    [artifact, chained, earlier, lineage, version, versions],
  );
  useFileViewerFacts([
    ...(version ? [`v${version}`] : []),
    `${graph.files} ${graph.files === 1 ? 'file' : 'files'}, ${graph.actions} ${graph.actions === 1 ? 'action' : 'actions'}`,
  ]);
  const open = (node: LineageGraphNode) => {
    if (node.folds) setUnfolded((value) => !value);
    else if (node.artifact) onOpenArtifact?.(node.artifact);
    else if (node.callId)
      onOpenActivity?.({
        callId: node.callId,
        tool: node.tool ?? node.name,
        sessionId: node.sessionId,
      });
  };
  return (
    <LineageGraph
      build={build}
      self={artifact}
      label={chained ? `Versions of ${artifact.name}` : 'Artifact lineage graph'}
      onOpen={open}
    />
  );
}

const NODE_ICON = { action: WrenchIcon, gap: TriangleAlertIcon };

/** One node: a button that opens what it names, with its hover card. */
function LineageNode({
  node,
  self,
  onOpen,
}: {
  node: LineageGraphNode;
  self: Artifact;
  onOpen?: (node: LineageGraphNode) => void;
}) {
  const Icon = node.kind === 'action' || node.kind === 'gap' ? NODE_ICON[node.kind] : undefined;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-lineage-node={node.kind}
          data-lineage-id={node.id}
          aria-label={node.detail ? `${node.name}, ${node.detail}` : node.name}
          aria-description={node.tip}
          aria-current={node.kind === 'self' ? 'true' : undefined}
          aria-expanded={node.folds ? !node.stacked : undefined}
          aria-disabled={onOpen ? undefined : true}
          onClick={() => onOpen?.(node)}
          style={{ left: node.x, top: node.y, width: node.width, height: LINEAGE_NODE_HEIGHT }}
          className={cn(
            'absolute flex items-center gap-[7px] rounded-lg border border-border bg-background px-[9px] text-left text-[11.5px] outline-none',
            'hover:outline-[1.5px] hover:outline-offset-2 hover:outline-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:cursor-default',
            node.kind === 'action' && 'border-dashed bg-muted',
            node.kind === 'gap' && 'border-dashed border-warning/70',
            node.kind === 'self' &&
              'border-accent-foreground shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent-foreground)_16%,transparent)]',
            node.stacked &&
              'shadow-[0_0_0_2px_color-mix(in_oklab,var(--accent-foreground)_16%,transparent),5px_5px_0_-1px_var(--background),5px_5px_0_0_var(--border),10px_10px_0_-1px_var(--background),10px_10px_0_0_var(--border)]',
          )}
        >
          {Icon ? (
            <Icon
              aria-hidden="true"
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground',
                node.kind === 'gap' && 'text-warning',
              )}
            />
          ) : (
            <ArtifactTypeIcon artifact={node.artifact ?? self} className="size-3.5 shrink-0" />
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <b
              className={cn(
                'truncate font-medium',
                node.kind === 'self' && 'text-accent-foreground',
              )}
            >
              {node.name}
            </b>
            {node.detail ? (
              <span className="truncate text-[10px] text-muted-foreground">{node.detail}</span>
            ) : null}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-64 px-[9px] py-1.5">
        <b className="font-semibold">{node.name}</b>
        <span className="block opacity-75">{node.tip}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** The drawn graph: dot grid, curved edges with arrows, and the nodes over them. */
function LineageGraph({
  build,
  self,
  label,
  onOpen,
  children,
}: {
  build: (spread: LineageSpread) => LineageGraphLayout;
  self: Artifact;
  label: string;
  onOpen?: (node: LineageGraphNode) => void;
  children?: ReactNode;
}) {
  const marker = useId();
  const gapMarker = `${marker}-gap`;
  const canvas = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const pane = usePaneSize(canvas);
  const room = pane ? pane.w - 2 * LINEAGE_CANVAS_PADDING : undefined;
  // A roomy pane (a maximized tab) spreads the drawing: whole names, then wider columns.
  const graph = useMemo(() => fitLineageLayout(build, room), [build, room]);
  // Fits the pane's width while names stay readable; below that floor the rest scrolls into view.
  const zoom = fitWidth(pane?.w, graph.width, LINEAGE_CANVAS_PADDING);
  const edges = useScrollEdges(canvas, drawing);
  return (
    <div className="relative h-full min-h-0 min-w-0">
      <div
        ref={canvas}
        role="region"
        aria-label={label}
        data-slot="lineage-canvas"
        className="flex h-full min-h-0 min-w-0 items-start overflow-auto bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[length:16px_16px] p-3.5"
      >
        {/* Laid out from the top-left, as the spec's canvas is; spare room falls below and right. */}
        <div
          ref={drawing}
          data-slot="lineage-fit"
          className="relative shrink-0"
          style={{ width: graph.width * zoom, height: graph.height * zoom }}
        >
          <div
            data-slot="lineage-layout"
            data-zoom={zoom < 1 ? zoom.toFixed(2) : undefined}
            className="absolute top-0 left-0 origin-top-left"
            style={{
              width: graph.width,
              height: graph.height,
              transform: zoom < 1 ? `scale(${zoom})` : undefined,
            }}
          >
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-visible"
              width={graph.width}
              height={graph.height}
            >
              <defs>
                <marker
                  id={marker}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground" />
                </marker>
                <marker
                  id={gapMarker}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L8,4 L0,8 z" className="fill-warning" />
                </marker>
              </defs>
              {graph.edges.map((edge) => (
                <path
                  key={edge.id}
                  d={edge.path}
                  fill="none"
                  strokeWidth={1.3}
                  strokeDasharray={edge.gap ? '4 3' : undefined}
                  markerEnd={`url(#${edge.gap ? gapMarker : marker})`}
                  className={edge.gap ? 'stroke-warning/80' : 'stroke-muted-foreground/70'}
                />
              ))}
            </svg>
            {graph.nodes.map((node) => (
              <LineageNode
                key={node.id}
                node={node}
                self={self}
                onOpen={canOpenLineageNode(node) ? onOpen : undefined}
              />
            ))}
            {children}
          </div>
        </div>
      </div>
      <GraphEdgeCues edges={edges} />
    </div>
  );
}
