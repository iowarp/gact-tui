import { memo, type MouseEvent } from 'react';
import type { KnowledgeGraphLayout } from '@/lib/knowledge-graph-layout';

/** Overlapping hit targets resolve to the closest dot, independently of SVG paint order. */
function pointerNote(
  event: MouseEvent<SVGCircleElement>,
  graph: KnowledgeGraphLayout,
  fallback: string,
): string {
  const matrix = event.currentTarget.getScreenCTM?.();
  if (!matrix) return fallback;
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  let closest = fallback;
  let distance = Infinity;
  for (const node of graph.nodes) {
    const candidate = (node.x - point.x) ** 2 + (node.y - point.y) ** 2;
    if (candidate < distance) {
      closest = node.id;
      distance = candidate;
    }
  }
  return closest;
}

/** Keep network geometry stable during selection and viewport translation. */
export const KnowledgeGraphGeometry = memo(function KnowledgeGraphGeometry({
  graph,
  active,
  selected,
  scale,
  onSelect,
  onHover,
}: {
  graph: KnowledgeGraphLayout;
  active: string;
  selected: string;
  scale: number;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
}) {
  const related = new Set([active]);
  const positions = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (edge.source === active) related.add(edge.target);
    if (edge.target === active) related.add(edge.source);
  }
  return (
    <>
      <g pointerEvents="none" aria-hidden="true">
        {graph.edges.map((edge) => {
          const source = positions.get(edge.source)!;
          const target = positions.get(edge.target)!;
          const highlighted = active === edge.source || active === edge.target;
          return (
            <line
              key={JSON.stringify([edge.source, edge.target])}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={highlighted ? 'var(--primary)' : 'var(--muted-foreground)'}
              strokeOpacity={active ? (highlighted ? 0.75 : 0.055) : 0.22}
              strokeWidth={highlighted ? 1.5 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
      {graph.nodes.map((node, index) => (
        <g key={node.id}>
          <circle
            cx={node.x}
            cy={node.y}
            r={Math.max(node.radius, 1.8 / scale)}
            fill={node.id === active ? 'var(--primary)' : 'var(--foreground)'}
            fillOpacity={!active || related.has(node.id) ? (node.degree ? 0.8 : 0.45) : 0.2}
            stroke={selected === node.id ? 'var(--primary)' : 'none'}
            strokeWidth={2 / scale}
            pointerEvents="none"
          />
          <circle
            data-note={node.id}
            cx={node.x}
            cy={node.y}
            r={Math.max(node.radius + 3, 7 / scale)}
            fill="transparent"
            className="cursor-pointer outline-none"
            role="button"
            aria-label={`Open ${node.title}, ${node.degree} linked notes`}
            aria-pressed={selected === node.id}
            tabIndex={selected ? (selected === node.id ? 0 : -1) : index ? -1 : 0}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) =>
              onSelect(event.detail ? pointerNote(event, graph, node.id) : node.id)
            }
            onMouseEnter={(event) => onHover(pointerNote(event, graph, node.id))}
            onMouseMove={(event) => onHover(pointerNote(event, graph, node.id))}
            onMouseLeave={() => onHover('')}
            onFocus={() => onHover(node.id)}
            onBlur={() => onHover('')}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(node.id);
              }
              const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
                event.key
              ];
              if (direction) {
                event.preventDefault();
                const nodes =
                  event.currentTarget.ownerSVGElement!.querySelectorAll<SVGCircleElement>(
                    '[data-note]',
                  );
                nodes[(index + direction + nodes.length) % nodes.length]?.focus();
              }
            }}
          >
            <title>
              {node.title} ({node.degree} linked notes)
            </title>
          </circle>
        </g>
      ))}
    </>
  );
});
