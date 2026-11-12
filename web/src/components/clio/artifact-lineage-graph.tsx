import type { Artifact, ArtifactLineage, ArtifactVersion } from '@clio/core/v3';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  getSmoothStepPath,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnNodeDrag,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { TriangleAlertIcon, WrenchIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  canOpenLineageNode,
  fitLineageLayout,
  layoutArtifactLineage,
  layoutVersionChain,
  lineageCounts,
  LINEAGE_NODE_HEIGHT,
  sketchArtifactLineage,
  type LineageGraphLayout,
  type LineageGraphNode,
  type LineageHints,
  type LineageSpread,
} from './artifact-lineage-layout';
import type { LineageActivity } from './artifact-lineage-view';
import { ArtifactTypeIcon } from './artifact-type-icon';
import { useFileViewerFacts } from './file-viewer-facts';
import { ApplyViewport, GraphControls } from './graph-controls';
import { GraphEdgeFade } from './graph-edge-fade';
import { flooredFit, focusViewport, fitWidth, usePaneSize } from './graph-fit';

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
  const counts = useMemo(
    () => lineageCounts(sketchArtifactLineage(artifact, lineage, { earlier })),
    [artifact, lineage, earlier],
  );
  const chained = Boolean(unfolded && version && versions?.length);
  const build = useCallback(
    (spread: LineageSpread, hints?: LineageHints) =>
      chained && version && versions
        ? layoutVersionChain(artifact, versions, version, undefined, spread, hints)
        : layoutArtifactLineage(artifact, lineage, { earlier, spread, hints }),
    [artifact, chained, earlier, lineage, version, versions],
  );
  useFileViewerFacts([
    ...(version ? [`v${version}`] : []),
    `${counts.files} ${counts.files === 1 ? 'file' : 'files'}, ${counts.actions} ${counts.actions === 1 ? 'action' : 'actions'}`,
  ]);
  const open = useCallback(
    (node: LineageGraphNode) => {
      if (node.folds) setUnfolded((value) => !value);
      else if (node.artifact) onOpenArtifact?.(node.artifact);
      else if (node.callId)
        onOpenActivity?.({
          callId: node.callId,
          tool: node.tool ?? node.name,
          sessionId: node.sessionId,
        });
    },
    [onOpenActivity, onOpenArtifact],
  );
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
          style={{ width: node.width, height: LINEAGE_NODE_HEIGHT }}
          className={cn(
            'flex items-center gap-[7px] rounded-lg border border-border bg-background px-[9px] text-left text-[11.5px] outline-none',
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

/** The canvas's inset around the drawing when it opens. Unit: CSS px. */
const LINEAGE_CANVAS_PADDING = 14;
/**
 * Fit (the zoom row's frame button) zooms out at most this far: names stay legible.
 * A lineage still too big for the pane is then centred on the opened file, the
 * rest a pan away.
 */
const FIT_FLOOR = 0.6;
const FIT = { padding: 0.06, minZoom: FIT_FLOOR, maxZoom: 1 };
/** The wheel and pinch zoom out past Fit to this, for an overview of the drawing's shape. */
const MIN_ZOOM = 0.4;
/** While the pane resizes, the layout waits this long for it to settle. Unit: ms. */
const RELAYOUT_WAIT = 80;

/**
 * The layout for `room` px, placed by ELK off the render path. The previous
 * drawing stays up while a new one is placed; a pane still being measured
 * waits briefly so the first drawing is the right one.
 */
function useLineageLayout(
  build: (spread: LineageSpread, hints?: LineageHints) => Promise<LineageGraphLayout>,
  room: number | undefined,
) {
  const [state, setState] = useState<{ graph?: LineageGraphLayout; failed?: boolean }>({});
  const drawn = useRef(false);
  useEffect(() => {
    let live = true;
    const wait = drawn.current ? RELAYOUT_WAIT : room ? 0 : 2 * RELAYOUT_WAIT;
    const timer = setTimeout(() => {
      fitLineageLayout(build, room).then(
        (graph) => {
          if (!live) return;
          drawn.current = true;
          setState({ graph });
        },
        () => live && setState((prev) => (prev.graph ? prev : { failed: true })),
      );
    }, wait);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [build, room]);
  return state;
}

interface LineageNodeData extends Record<string, unknown> {
  node: LineageGraphNode;
  self: Artifact;
  onOpen?: (node: LineageGraphNode) => void;
}
type LineageFlowNode = Node<LineageNodeData, 'lineage'>;
interface LineageEdgeData extends Record<string, unknown> {
  /** ELK's route; absent once an end has been dragged away from where ELK placed it. */
  path?: string;
  gap: boolean;
}
type LineageFlowEdge = Edge<LineageEdgeData, 'lineage'>;

const HANDLE = '!size-0 !min-h-0 !min-w-0 !border-0 !opacity-0';

function LineageFlowNodeView({ data }: NodeProps<LineageFlowNode>) {
  return (
    <>
      <Handle className={HANDLE} isConnectable={false} position={Position.Left} type="target" />
      <LineageNode node={data.node} self={data.self} onOpen={data.onOpen} />
      <Handle className={HANDLE} isConnectable={false} position={Position.Right} type="source" />
    </>
  );
}

const EDGE_STROKE = 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)';
const GAP_STROKE = 'color-mix(in oklab, var(--warning) 80%, transparent)';

/** ELK's routed edge; while an end is being dragged, a right-angle step between the moved ends. */
function LineageEdgeView({
  id,
  data,
  markerEnd,
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps<LineageFlowEdge>) {
  const path =
    data?.path ||
    getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Right,
      targetX: targetX - 1,
      targetY,
      targetPosition: Position.Left,
      borderRadius: 6,
    })[0];
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      interactionWidth={0}
      style={{
        stroke: data?.gap ? GAP_STROKE : EDGE_STROKE,
        strokeWidth: 1.3,
        strokeDasharray: data?.gap ? '4 3' : undefined,
      }}
    />
  );
}

const nodeTypes = { lineage: LineageFlowNodeView };
const edgeTypes = { lineage: LineageEdgeView };

/**
 * The lineage canvas: a dot grid with ELK's layered drawing over it. It opens at a
 * readable scale with the opened file in view; the reader zooms (wheel, pinch, the
 * zoom row or + ? 0), pans the canvas and drags nodes, and ELK re-lays the drawing
 * around each drop.
 */
function LineageGraph({
  build,
  self,
  label,
  onOpen,
}: {
  build: (spread: LineageSpread, hints?: LineageHints) => Promise<LineageGraphLayout>;
  self: Artifact;
  label: string;
  onOpen?: (node: LineageGraphNode) => void;
}) {
  const canvas = useRef<HTMLElement>(null);
  const pane = usePaneSize(canvas);
  const room = pane ? pane.w - 2 * LINEAGE_CANVAS_PADDING : undefined;
  // A roomy pane (a maximized tab) spreads the drawing: whole names, then wider columns.
  const { graph: fitted, failed } = useLineageLayout(build, room);
  // The reader's drops re-lay the drawing; a new fit for the pane starts from ELK's own.
  const [relaid, setRelaid] = useState<{
    from: LineageGraphLayout;
    graph: LineageGraphLayout;
  }>();
  const graph = relaid && relaid.from === fitted ? relaid.graph : fitted;
  const turn = useRef(0);
  const relayout = useCallback(
    (hints: LineageHints) => {
      if (!fitted) return;
      const mine = ++turn.current;
      build(fitted.spread, hints).then(
        (next) => mine === turn.current && setRelaid({ from: fitted, graph: next }),
        () => undefined,
      );
    },
    [build, fitted],
  );
  const viewport = useMemo(() => openingViewport(fitted, pane), [fitted, pane]);
  return (
    <section
      ref={canvas}
      aria-label={label}
      aria-busy={!graph && !failed ? true : undefined}
      data-slot="lineage-canvas"
      data-zoom={graph ? viewport.zoom.toFixed(2) : undefined}
      className="relative h-full min-h-0 min-w-0 overflow-hidden"
    >
      {graph ? (
        <LineageFlow
          key={label}
          graph={graph}
          self={self}
          viewport={viewport}
          region={canvas}
          onOpen={onOpen}
          onRelayout={relayout}
        />
      ) : failed ? (
        <p className="p-3.5 text-[12px] text-muted-foreground">
          Couldn't draw the lineage. Reopen the tab to try again.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Fits the pane's width while names stay readable; past that floor the drawing
 * scrolls so the opened file sits mid-pane and the rest is a pan away.
 */
function openingViewport(
  graph: LineageGraphLayout | undefined,
  pane: { w: number; h: number } | undefined,
): Viewport {
  if (!graph) return { x: LINEAGE_CANVAS_PADDING, y: LINEAGE_CANVAS_PADDING, zoom: 1 };
  const self = graph.nodes.find((node) => node.kind === 'self');
  return focusViewport({
    pane,
    width: graph.width,
    height: graph.height,
    focus: self && { x: self.x + self.width / 2, y: self.y + LINEAGE_NODE_HEIGHT / 2 },
    zoom: fitWidth(pane?.w, graph.width, LINEAGE_CANVAS_PADDING),
    margin: LINEAGE_CANVAS_PADDING,
  });
}

function LineageFlow({
  graph,
  self,
  viewport,
  region,
  onOpen,
  onRelayout,
}: {
  graph: LineageGraphLayout;
  self: Artifact;
  viewport: Viewport;
  region: RefObject<HTMLElement | null>;
  onOpen?: (node: LineageGraphNode) => void;
  onRelayout?: (hints: LineageHints) => void;
}) {
  // Where the reader dragged nodes to, for this layout only: a new layout starts clean.
  const [moved, setMoved] = useState<{
    graph: LineageGraphLayout;
    at: Readonly<Record<string, XYPosition>>;
  }>({ graph, at: {} });
  const at = moved.graph === graph ? moved.at : undefined;
  const nodes = useMemo(
    () =>
      graph.nodes.map(
        (node): LineageFlowNode => ({
          id: node.id,
          type: 'lineage',
          position: at?.[node.id] ?? { x: node.x, y: node.y },
          width: node.width,
          height: LINEAGE_NODE_HEIGHT,
          data: { node, self, onOpen: canOpenLineageNode(node) ? onOpen : undefined },
        }),
      ),
    [at, graph, onOpen, self],
  );
  const edges = useMemo(
    () =>
      graph.edges.map(
        (edge): LineageFlowEdge => ({
          id: edge.id,
          source: edge.from,
          target: edge.to,
          type: 'lineage',
          data: { gap: edge.gap, path: at?.[edge.from] || at?.[edge.to] ? undefined : edge.path },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edge.gap ? 'var(--warning)' : 'var(--muted-foreground)',
            width: 7,
            height: 7,
          },
        }),
      ),
    [at, graph],
  );
  const onNodesChange = useCallback(
    (changes: NodeChange<LineageFlowNode>[]) => {
      const dragged = changes.filter(
        (change): change is Extract<typeof change, { type: 'position' }> =>
          change.type === 'position' && Boolean(change.position),
      );
      if (!dragged.length) return;
      setMoved((prev) => {
        const next = { ...(prev.graph === graph ? prev.at : {}) };
        for (const change of dragged) next[change.id] = change.position!;
        return { graph, at: next };
      });
    },
    [graph],
  );
  // On drop, ELK re-lays the drawing from where every node now sits.
  const onNodeDragStop = useCallback<OnNodeDrag<LineageFlowNode>>(
    (_event, _node, dropped) => {
      const placed = new Map(graph.nodes.map((node) => [node.id, node]));
      const shifted = dropped.filter((node) => {
        const before = placed.get(node.id);
        return !before || before.x !== node.position.x || before.y !== node.position.y;
      });
      if (!shifted.length || !onRelayout) return;
      const hints: Record<string, XYPosition> = {};
      for (const node of graph.nodes) hints[node.id] = at?.[node.id] ?? { x: node.x, y: node.y };
      for (const node of shifted) hints[node.id] = node.position;
      onRelayout(hints);
    },
    [at, graph, onRelayout],
  );
  // Fit at the floor centres the opened file, measuring the pane when pressed.
  const fitTo = () => {
    const pane = region.current;
    const boxes = nodes.map((node) => ({
      ...node.position,
      width: node.width ?? 0,
      height: LINEAGE_NODE_HEIGHT,
    }));
    const focus = nodes.findIndex((node) => node.data.node.kind === 'self');
    return flooredFit({
      pane: pane ? { w: pane.clientWidth, h: pane.clientHeight } : undefined,
      boxes,
      focus: boxes[focus],
      floor: FIT_FLOOR,
      padding: FIT.padding,
      margin: LINEAGE_CANVAS_PADDING,
    });
  };
  return (
    <ReactFlow<LineageFlowNode, LineageFlowEdge>
      defaultViewport={viewport}
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      minZoom={MIN_ZOOM}
      maxZoom={2}
      nodesConnectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      elementsSelectable={false}
      zoomOnDoubleClick={false}
      proOptions={{ hideAttribution: true }}
    >
      <ApplyViewport viewport={viewport} />
      <GraphEdgeFade width={graph.width} height={graph.height} />
      <Background color="var(--border)" gap={16} size={1.2} variant={BackgroundVariant.Dots} />
      <GraphControls label="Lineage graph controls" region={region} fit={FIT} fitTo={fitTo} />
    </ReactFlow>
  );
}
