import type { Artifact, ArtifactLineage, ArtifactLineageNode } from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import {
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileBoxIcon, TriangleAlertIcon, WrenchIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';

interface LineageNodeData extends Record<string, unknown> {
  artifact?: Artifact;
  details: readonly string[];
  label: string;
  nodeType: ArtifactLineageNode['type'];
  onOpenArtifact?: (artifact: Artifact) => void;
  self: boolean;
  width: number;
}

type LineageFlowNode = Node<LineageNodeData, 'clio-lineage'>;

const nodeTypes = { 'clio-lineage': LineageNodeCard };
const minimumNodeWidth = 184;
const maximumNodeWidth = 292;
const nodeHeight = 68;

export function ArtifactLineageGraph({
  artifact,
  lineage,
  onOpenArtifact,
}: {
  artifact: Artifact;
  lineage: ArtifactLineage;
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const graph = useMemo(
    () => buildArtifactLineageGraph(artifact, lineage, onOpenArtifact),
    [artifact, lineage, onOpenArtifact],
  );

  return (
    <div
      aria-label="Artifact lineage graph"
      className="h-[clamp(24rem,58vh,42rem)] min-w-0 overflow-hidden bg-background/40"
      role="img"
    >
      <ReactFlow<LineageFlowNode, Edge>
        edges={graph.edges}
        elementsSelectable
        fitView
        fitViewOptions={{ maxZoom: 1, minZoom: 0.48, padding: 0.16 }}
        maxZoom={1.6}
        minZoom={0.12}
        nodes={graph.nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
        panOnDrag
        proOptions={{ hideAttribution: true }}
        zoomOnDoubleClick={false}
      >
        <Controls
          aria-label="Lineage graph controls"
          className="!border-border !shadow-none [&_button]:!border-border [&_button]:!bg-background [&_button]:!fill-foreground [&_button:hover]:!bg-muted"
          showInteractive={false}
        />
      </ReactFlow>
    </div>
  );
}

// Pure graph construction keeps the layout testable without changing wire semantics.
// oxlint-disable-next-line react/only-export-components
export function buildArtifactLineageGraph(
  artifact: Artifact,
  lineage: ArtifactLineage,
  onOpenArtifact?: (artifact: Artifact) => void,
): { nodes: LineageFlowNode[]; edges: Edge[] } {
  const nodes: LineageFlowNode[] = lineage.nodes.map((node) => {
    const self = node.id === lineage.root;
    const linkedArtifact =
      node.type === 'artifact' && !self ? artifactFromNode(node, artifact) : undefined;
    const details = lineageNodeDetails(node);
    const label = lineageNodeLabel(node);
    const width = lineageNodeWidth(label, details);
    return {
      id: node.id,
      type: 'clio-lineage',
      position: { x: 0, y: 0 },
      data: {
        artifact: linkedArtifact,
        details,
        label,
        nodeType: node.type,
        onOpenArtifact,
        self,
        width,
      },
      style: { width },
      ariaLabel: [label, ...details, self ? 'current artifact' : ''].filter(Boolean).join(', '),
    };
  });
  const edges: Edge[] = lineage.edges.map((edge) => ({
    id: `${edge.from}:${edge.to}:${edge.type}`,
    source: edge.from,
    target: edge.to,
    type: 'smoothstep',
    label: edgeLabel(edge.type, edge.evidence),
    markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20, color: 'var(--primary)' },
    style: { stroke: 'var(--primary)', strokeOpacity: 0.78, strokeWidth: 1.5 },
    labelStyle: { fill: 'var(--popover-foreground)', fontSize: 10, fontWeight: 600 },
    labelBgStyle: {
      fill: 'var(--popover)',
      fillOpacity: 0.96,
      stroke: 'var(--border)',
      strokeWidth: 1,
    },
    labelBgPadding: [6, 4],
    labelBgBorderRadius: 6,
  }));
  return layoutGraph(nodes, edges);
}

function LineageNodeCard({ data }: NodeProps<LineageFlowNode>) {
  const Icon =
    data.nodeType === 'activity'
      ? WrenchIcon
      : data.nodeType === 'gap'
        ? TriangleAlertIcon
        : FileBoxIcon;
  const content = (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          'size-4 shrink-0',
          data.self
            ? 'text-primary'
            : data.nodeType === 'gap'
              ? 'text-warning'
              : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-xs font-medium', data.self && 'text-primary')}>
          {data.label}
        </span>
        <span className="mt-0.5 flex min-w-0 gap-1.5 text-[10px] text-muted-foreground">
          {data.details.map((detail) => (
            <span className="truncate" key={detail}>
              {detail}
            </span>
          ))}
        </span>
      </span>
    </>
  );
  return (
    <div
      className={cn(
        'rounded-lg border bg-background px-2.5 py-2 shadow-sm',
        data.self && 'border-primary/70 ring-1 ring-primary/20',
      )}
      style={{ width: data.width }}
    >
      <Handle className="!size-0 !border-0" position={Position.Left} type="target" />
      {data.artifact && data.onOpenArtifact ? (
        <button
          aria-label={`Open lineage artifact ${data.label}`}
          className="nodrag nopan flex w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => data.onOpenArtifact?.(data.artifact!)}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-center gap-2">{content}</div>
      )}
      <Handle className="!size-0 !border-0" position={Position.Right} type="source" />
    </div>
  );
}

function layoutGraph(
  nodes: LineageFlowNode[],
  edges: Edge[],
): {
  nodes: LineageFlowNode[];
  edges: Edge[];
} {
  const graph = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  const longestRelationship = Math.max(
    0,
    ...edges.map((edge) => (typeof edge.label === 'string' ? edge.label.length : 0)),
  );
  const relationshipClearance = Math.max(112, longestRelationship * 7 + 52);
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 22,
    ranksep: relationshipClearance,
    marginx: 28,
    marginy: 20,
  });
  for (const node of nodes) graph.setNode(node.id, { width: node.data.width, height: nodeHeight });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  layout(graph);
  return {
    nodes: nodes.map((node) => {
      const position = graph.node(node.id);
      return {
        ...node,
        position: { x: position.x - node.data.width / 2, y: position.y - nodeHeight / 2 },
      };
    }),
    edges,
  };
}

function lineageNodeWidth(label: string, details: readonly string[]): number {
  const detailWidth = details.reduce((total, detail) => total + detail.length * 5.8 + 6, 0);
  const contentWidth = Math.max(label.length * 7.2, detailWidth) + 58;
  return Math.round(Math.min(maximumNodeWidth, Math.max(minimumNodeWidth, contentWidth)));
}

function artifactFromNode(node: ArtifactLineageNode, fallback: Artifact): Artifact {
  return {
    id: node.id,
    session_id: stringField(node, 'session_id') || fallback.session_id,
    workspace_id: stringField(node, 'workspace_id') || fallback.workspace_id,
    name: stringField(node, 'name') || 'Artifact',
    media_type: stringField(node, 'media_type') || 'application/octet-stream',
    uri: stringField(node, 'uri') || `artifact://${node.id}`,
    fetch_path: stringField(node, 'fetch_path') || undefined,
    custody: stringField(node, 'custody') || undefined,
    sha256: stringField(node, 'sha256') || undefined,
    size: numberField(node, 'size_bytes'),
    created_at: stringField(node, 'created_at') || undefined,
  };
}

function lineageNodeLabel(node: ArtifactLineageNode): string {
  if (node.type === 'activity') return stringField(node, 'tool') || 'Recorded activity';
  if (node.type === 'gap') return stringField(node, 'reason') || 'Provenance gap';
  return stringField(node, 'name') || 'Artifact';
}

function lineageNodeDetails(node: ArtifactLineageNode): string[] {
  if (node.type === 'activity') return [stringField(node, 'status') || 'Recorded activity'];
  if (node.type === 'gap') return ['Evidence missing'];
  const version = numberField(node, 'version');
  const size = numberField(node, 'size_bytes') ?? numberField(node, 'size');
  return [version ? `Version ${version}` : '', size ? formatBytes(size) : ''].filter(Boolean);
}

function edgeLabel(type: ArtifactLineage['edges'][number]['type'], evidence: string): ReactNode {
  const relationship =
    type === 'revision_of' ? 'Revises' : type === 'generated' ? 'Generated' : 'Used';
  return evidence && evidence !== 'hash-pair' ? (
    <span className="flex items-center gap-1.5">
      <span>{relationship}</span>
      <span className="font-normal text-muted-foreground">{evidence}</span>
    </span>
  ) : (
    relationship
  );
}

function stringField(node: ArtifactLineageNode, key: string): string {
  const value = node[key];
  return typeof value === 'string' ? value : '';
}

function numberField(node: ArtifactLineageNode, key: string): number | undefined {
  const value = node[key];
  return typeof value === 'number' ? value : undefined;
}
