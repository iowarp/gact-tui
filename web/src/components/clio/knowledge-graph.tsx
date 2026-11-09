import type { KnowledgeSnapshot } from '@clio/core/v3';
import { ScanIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { knowledgeTopology, type KnowledgeGraphLayout } from '@/lib/knowledge-graph-layout';
import { knowledgeLabels, type GraphCamera, type GraphSize } from '@/lib/knowledge-graph-labels';
import { KnowledgeGraphGeometry } from './knowledge-graph-geometry';
import { KNOWLEDGE_CARD } from './knowledge-vault-stats';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';

/** Up to this many notes the graph draws cards; beyond it, dots (the layout's small graph). */
const CARD_GRAPH_LIMIT = 40;

function fittedCamera(graph: KnowledgeGraphLayout, size: GraphSize): GraphCamera {
  if (!graph.nodes.length) return { x: size.width / 2, y: size.height / 2, scale: 1 };
  const cards = graph.nodes.length <= CARD_GRAPH_LIMIT;
  const xs = graph.nodes.map((node) => node.x),
    ys = graph.nodes.map((node) => node.y);
  const left = Math.min(...xs),
    right = Math.max(...xs),
    top = Math.min(...ys),
    bottom = Math.max(...ys);
  const scale = Math.max(
    0.04,
    Math.min(
      cards ? 1 : 1.6,
      (size.width - 100) / (right - left + (cards ? KNOWLEDGE_CARD.width + 48 : 120)),
      (size.height - 80) / (bottom - top + (cards ? KNOWLEDGE_CARD.height + 64 : 100)),
    ),
  );
  return {
    x: size.width / 2 - ((left + right) / 2) * scale,
    y: size.height / 2 - ((top + bottom) / 2) * scale,
    scale,
  };
}

/**
 * The vault's note graph, full-bleed on a dotted canvas: stable geometry,
 * readable names and local emphasis. Selecting a note selects it in the vault.
 */
export function KnowledgeGraph({
  snapshot,
  selected,
  onSelect,
  isolated = true,
}: {
  snapshot: KnowledgeSnapshot;
  selected: string;
  onSelect: (path: string) => void;
  /** Whether notes without links show, around the linked ones. */
  isolated?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const arranged = useRef<KnowledgeGraphLayout | undefined>(undefined);
  const automaticFraming = useRef(true);
  const measured = useRef<GraphSize>({ width: 0, height: 0 });
  const [size, setSize] = useState<GraphSize>({ width: 0, height: 0 });
  const [camera, setCamera] = useState<GraphCamera>({ x: 0, y: 0, scale: 1 });
  const [hover, setHover] = useState('');
  const [layout, setLayout] = useState<{
    topology: KnowledgeGraphLayout;
    graph?: KnowledgeGraphLayout;
    error?: string;
  }>();
  const drag = useRef<{ x: number; y: number; origin: GraphCamera } | null>(null);
  const topology = useMemo(() => {
    const result = knowledgeTopology(snapshot);
    return isolated ? result : { ...result, nodes: result.nodes.filter((node) => node.degree > 0) };
  }, [snapshot, isolated]);
  const graph = layout?.topology === topology ? layout.graph : undefined;
  const error = layout?.topology === topology ? layout.error : undefined;
  useEffect(() => {
    arranged.current = undefined;
    const worker = new Worker(new URL('../../lib/knowledge-graph.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<{ graph?: KnowledgeGraphLayout; error?: string }>) => {
      setLayout({ topology, ...event.data });
      if (event.data.graph && host.current) {
        arranged.current = event.data.graph;
        automaticFraming.current = true;
        setCamera(
          fittedCamera(event.data.graph, {
            width: host.current.clientWidth,
            height: host.current.clientHeight,
          }),
        );
      }
    };
    worker.onerror = () =>
      setLayout({ topology, error: 'Choose notes in the vault list, or Refresh.' });
    worker.postMessage(topology);
    return () => worker.terminate();
  }, [topology]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: entry.contentRect.width, height: entry.contentRect.height };
      const previous = measured.current;
      if (next.width === previous.width && next.height === previous.height) return;
      measured.current = next;
      setSize(next);
      if (automaticFraming.current && arranged.current) {
        setCamera(fittedCamera(arranged.current, next));
      } else {
        setCamera((current) => ({
          ...current,
          x: current.x + (next.width - previous.width) / 2,
          y: current.y + (next.height - previous.height) / 2,
        }));
      }
    });
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  const fit = useCallback(() => {
    automaticFraming.current = true;
    if (graph) setCamera(fittedCamera(graph, size));
  }, [graph, size]);
  const active = hover || selected;
  useEffect(() => {
    const node = graph?.nodes.find((item) => item.id === active);
    if (!node || !size.width) return;
    // Wait for the reader's resize observation before framing a selected node.
    const frame = requestAnimationFrame(() =>
      setCamera((current) => {
        const x = node.x * current.scale + current.x,
          y = node.y * current.scale + current.y;
        return x >= 35 && x <= size.width - 35 && y >= 35 && y <= size.height - 35
          ? current
          : {
              ...current,
              x: size.width / 2 - node.x * current.scale,
              y: size.height / 2 - node.y * current.scale,
            };
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, graph, size]);
  const zoom = useCallback(
    (factor: number, x = size.width / 2, y = size.height / 2) => {
      automaticFraming.current = false;
      setCamera((current) => {
        const scale = Math.min(5, Math.max(0.04, current.scale * factor));
        return {
          scale,
          x: x - ((x - current.x) * scale) / current.scale,
          y: y - ((y - current.y) * scale) / current.scale,
        };
      });
    },
    [size],
  );
  useEffect(() => {
    const element = host.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom]);
  const cards = Boolean(graph && graph.nodes.length <= CARD_GRAPH_LIMIT);
  const labels = useMemo(
    () => (graph && !cards ? knowledgeLabels(graph, camera, size, active) : []),
    [graph, cards, camera, size, active],
  );
  const select = useCallback((path: string) => onSelect(path), [onSelect]);
  const setHovered = useCallback((path: string) => setHover(path), []);
  return (
    <div
      ref={host}
      role="region"
      aria-label="Note graph"
      className="relative h-full min-h-0 overflow-hidden bg-background bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:14px_14px]"
    >
      {!graph && !error && <StateView kind="loading" size="viewer" title="Arranging the notes" />}
      {error && (
        <StateView
          kind="error"
          size="viewer"
          title="The note graph could not be arranged"
          detail={error}
        />
      )}
      {graph && !graph.nodes.length && (
        <StateView
          kind="empty"
          size="viewer"
          className="absolute inset-0"
          title={isolated ? 'No notes match this view' : 'No linked notes in this view'}
          detail={
            isolated ? undefined : 'Show unlinked notes from More actions, or change the search.'
          }
        />
      )}
      {graph && (
        <svg
          width="100%"
          height="100%"
          className="absolute inset-0 touch-none"
          aria-label={`${graph.nodes.length} notes, ${graph.edges.length} connections`}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, origin: camera };
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            automaticFraming.current = false;
            setCamera({
              ...drag.current.origin,
              x: drag.current.origin.x + event.clientX - drag.current.x,
              y: drag.current.origin.y + event.clientY - drag.current.y,
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
            <KnowledgeGraphGeometry
              graph={graph}
              active={active}
              selected={selected}
              scale={camera.scale}
              cards={cards}
              onSelect={select}
              onHover={setHovered}
            />
          </g>
          <g
            aria-hidden="true"
            pointerEvents="none"
            fill="var(--foreground)"
            fontSize={13}
            stroke="var(--background)"
            strokeWidth={4}
            paintOrder="stroke"
            strokeLinejoin="round"
          >
            {labels.map((label) => (
              <text
                key={label.id}
                x={label.x}
                y={label.y}
                fontWeight={label.id === active ? 600 : 400}
              >
                {label.text}
              </text>
            ))}
          </g>
        </svg>
      )}
      <div
        className="absolute right-3 bottom-3 flex gap-1"
        role="group"
        aria-label="Graph navigation"
      >
        <IconButton label="Zoom in" icon={<ZoomInIcon />} onClick={() => zoom(1.3)} />
        <IconButton label="Zoom out" icon={<ZoomOutIcon />} onClick={() => zoom(1 / 1.3)} />
        <IconButton label="Fit" icon={<ScanIcon />} onClick={fit} />
      </div>
    </div>
  );
}
