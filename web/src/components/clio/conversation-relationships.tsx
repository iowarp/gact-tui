import { conversationRole } from './conversation-family-navigation';
import type { Artifact, Session } from '@clio/core/v3';
import { graphlib, layout } from '@dagrejs/dagre';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useRef, type RefObject, type ReactNode } from 'react';
import { isManagedChildSession } from '@/lib/session-state';
import { cn } from '@/lib/utils';
import { ConversationFamilyLegend, ConversationRoleIcon } from './conversation-family-label';
import { ConversationInspector } from './conversation-inspector';
import { conversationFamily } from './conversation-relationships-model';

interface ConversationNodeData extends Record<string, unknown> {
  session: Session;
  current: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  incoming: boolean;
  outgoing: boolean;
}
type ConversationNode = Node<ConversationNodeData, 'conversation'>;
const nodeTypes = { conversation: ConversationCard };
const width = 232;
const height = 92;

/** The same workspace's conversation ancestry, separate from file revision lineage. */
export function ConversationRelationships({
  sessions,
  sessionId,
  header,
  onOpenArtifact,
  selectedId: requestedId,
  onSelect,
}: {
  sessions: readonly Session[];
  sessionId: string;
  header: ReactNode;
  onOpenArtifact?: (artifact: Artifact) => void;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const family = useMemo(() => conversationFamily(sessions, sessionId), [sessions, sessionId]);
  const container = useRef<HTMLDivElement>(null);
  const selectedId = requestedId ?? sessionId;
  const selected =
    family.sessions.find((session) => session.id === selectedId) ?? family.sessions[0];
  const graph = useMemo(() => {
    const dag = new graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    dag.setGraph({ rankdir: 'TB', nodesep: 38, ranksep: 64, marginx: 20, marginy: 24 });
    for (const session of family.sessions) dag.setNode(session.id, { width, height });
    for (const edge of family.edges) dag.setEdge(edge.source, edge.target);
    layout(dag);
    const nodes: ConversationNode[] = family.sessions.map((session) => {
      const position = dag.node(session.id);
      return {
        id: session.id,
        type: 'conversation',
        position: { x: position.x - width / 2, y: position.y - height / 2 },
        style: { width, height },
        ariaLabel: `${session.title}, ${conversationRole(session)}`,
        data: {
          session,
          current: session.id === sessionId,
          selected: session.id === selectedId,
          onSelect,
          incoming: family.edges.some((edge) => edge.target === session.id),
          outgoing: family.edges.some((edge) => edge.source === session.id),
        },
      };
    });
    const edges: Edge[] = family.edges.map((edge) => ({
      id: `${edge.source}:${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      label: edge.kind === 'branch' ? 'User fork' : 'Subagent',
      pathOptions: { borderRadius: 10 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--primary)', width: 18, height: 18 },
      style: {
        stroke: 'var(--primary)',
        strokeWidth: 1.5,
        strokeOpacity: 0.75,
        strokeDasharray: edge.kind === 'delegation' ? '5 4' : undefined,
      },
      labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 },
      labelBgStyle: { fill: 'var(--background)', fillOpacity: 1 },
      labelBgPadding: [5, 3],
    }));
    return { nodes, edges };
  }, [family, selectedId, sessionId, onSelect]);
  if (!selected)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        Conversation relationships are unavailable.
      </p>
    );
  return (
    <section
      aria-label="Conversation relationships"
      className="grid min-w-0 overflow-hidden @min-[48rem]:grid-cols-[minmax(0,1fr)_19rem]"
    >
      <div className="flex min-w-0 flex-col">
        {header}
        <div
          ref={container}
          aria-label="Conversation relationship graph"
          className="min-w-0 flex-1 overflow-hidden"
          style={{
            minHeight: Math.min(
              620,
              Math.max(
                320,
                Math.max(...graph.nodes.map((node) => node.position.y + height)) -
                  Math.min(...graph.nodes.map((node) => node.position.y)) +
                  64,
              ),
            ),
          }}
          role="region"
        >
          <ReactFlow<ConversationNode, Edge>
            key={family.sessions.map((session) => session.id).join(':')}
            nodes={graph.nodes}
            edges={graph.edges}
            nodeTypes={nodeTypes}
            nodesConnectable={false}
            nodesDraggable={false}
            fitView
            fitViewOptions={{ padding: 0.15, maxZoom: 1, minZoom: 0.05 }}
            minZoom={0.05}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            zoomOnDoubleClick={false}
          >
            <FitOnResize container={container} />
            <Background color="var(--border)" gap={24} size={1} />
            <Controls
              showInteractive={false}
              className="!border-border !shadow-none [&_button]:!border-border [&_button]:!bg-background [&_button]:!fill-foreground"
            />
          </ReactFlow>
        </div>
        <div className="px-3 py-2">
          <ConversationFamilyLegend />
          {family.incomplete ? (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              Some family records are unavailable.
            </p>
          ) : null}
        </div>
      </div>
      <ConversationInspector
        session={selected}
        sessions={family.sessions}
        onOpenArtifact={onOpenArtifact}
      />
    </section>
  );
}

/** Refit after the canvas changes host or width, including the mobile sheet. */
function FitOnResize({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void fitView({ padding: 0.15, maxZoom: 1, minZoom: 0.05 });
      });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [container, fitView]);
  return null;
}

function ConversationCard({ data }: NodeProps<ConversationNode>) {
  return (
    <div
      className={cn(
        'h-full rounded-lg border bg-background px-3 py-2.5 shadow-sm',
        data.selected && 'border-primary ring-1 ring-primary/20',
        isManagedChildSession(data.session) && 'border-dashed',
      )}
    >
      <Handle
        className="!size-1.5 !border-0 !bg-primary"
        type="target"
        position={Position.Top}
        style={{ opacity: data.incoming ? 1 : 0 }}
      />
      <button
        type="button"
        aria-label={`Select ${data.session.title}`}
        aria-pressed={data.selected}
        onClick={() => data.onSelect(data.session.id)}
        className="nodrag nopan flex h-full w-full gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ConversationRoleIcon
          session={data.session}
          className="mt-0.5 size-4 shrink-0 text-primary"
        />
        <span className="min-w-0">
          <span className="line-clamp-2 text-xs font-semibold leading-4">{data.session.title}</span>
          <span className="mt-1 block text-[10px] text-muted-foreground">
            {conversationRole(data.session)}
            {data.current ? ' (current)' : ''}
          </span>
        </span>
      </button>
      <Handle
        className="!size-1.5 !border-0 !bg-primary"
        type="source"
        position={Position.Bottom}
        style={{ opacity: data.outgoing ? 1 : 0 }}
      />
    </div>
  );
}
