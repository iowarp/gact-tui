import type { Artifact, ArtifactLineage, ArtifactVersion } from '@clio/core/v3';
import { TriangleAlertIcon, WrenchIcon } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  canOpenLineageNode,
  layoutArtifactLineage,
  layoutVersionChain,
  LINEAGE_NODE_HEIGHT,
  type LineageGraphLayout,
  type LineageGraphNode,
} from './artifact-lineage-layout';
import type { LineageActivity } from './artifact-lineage-view';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { useFileViewerFacts } from './file-viewer-facts';

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
  const chain = useMemo(
    () =>
      unfolded && version && versions?.length
        ? layoutVersionChain(artifact, versions, version)
        : undefined,
    [artifact, unfolded, version, versions],
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
      graph={chain ?? graph}
      self={artifact}
      label={chain ? `Versions of ${artifact.name}` : 'Artifact lineage graph'}
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
                node.kind === 'action' && 'font-mono text-[11px]',
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
      <TooltipContent side="bottom" align="start" className="max-w-64 text-[11.5px]">
        <b className="font-semibold">{node.name}</b>
        <span className="block opacity-75">{node.tip}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** The drawn graph: dot grid, curved edges with arrows, and the nodes over them. */
function LineageGraph({
  graph,
  self,
  label,
  onOpen,
  children,
}: {
  graph: LineageGraphLayout;
  self: Artifact;
  label: string;
  onOpen?: (node: LineageGraphNode) => void;
  children?: ReactNode;
}) {
  const marker = useId();
  const gapMarker = `${marker}-gap`;
  return (
    <div
      role="region"
      aria-label={label}
      className="flex h-full min-h-0 min-w-0 overflow-auto bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[length:16px_16px]"
    >
      {/* Centred while it fits; auto margins fall to zero and it scrolls once it does not. */}
      <div
        className="relative m-auto shrink-0"
        style={{ width: graph.width, height: graph.height }}
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
  );
}
