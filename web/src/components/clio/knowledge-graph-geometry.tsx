import { FileTextIcon } from 'lucide-react';
import { memo, type KeyboardEvent, type MouseEvent } from 'react';
import type { KnowledgeGraphLayout, KnowledgeGraphNode } from '@/lib/knowledge-graph-layout';
import { KNOWLEDGE_CARD, knowledgeLinkCount } from './knowledge-vault-stats';

/** Overlapping hit targets resolve to the closest dot, independently of SVG paint order. */
function pointerNote(
  event: MouseEvent<SVGGraphicsElement>,
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

/** One horizontal-tangent curve between the facing sides of two cards. */
function cardEdge(source: KnowledgeGraphNode, target: KnowledgeGraphNode): string {
  const [left, right] = source.x <= target.x ? [source, target] : [target, source];
  const half = KNOWLEDGE_CARD.width / 2;
  if (right.x - left.x < KNOWLEDGE_CARD.width) {
    const [top, bottom] = left.y <= right.y ? [left, right] : [right, left];
    const y1 = top.y + KNOWLEDGE_CARD.height / 2;
    const y2 = bottom.y - KNOWLEDGE_CARD.height / 2;
    const middle = (y1 + y2) / 2;
    return `M${top.x} ${y1} C${top.x} ${middle} ${bottom.x} ${middle} ${bottom.x} ${y2}`;
  }
  const x1 = left.x + half;
  const x2 = right.x - half;
  const middle = (x1 + x2) / 2;
  return `M${x1} ${left.y} C${middle} ${left.y} ${middle} ${right.y} ${x2} ${right.y}`;
}

function shortTitle(title: string): string {
  return title.length > 14 ? `${title.slice(0, 13)}…` : title;
}

/**
 * Keep network geometry stable during selection and viewport translation. A
 * small vault draws each note as a card (title and link count); a big one as
 * dots sized by their links, named by the canvas's labels.
 */
export const KnowledgeGraphGeometry = memo(function KnowledgeGraphGeometry({
  graph,
  active,
  selected,
  scale,
  cards = false,
  onSelect,
  onHover,
}: {
  graph: KnowledgeGraphLayout;
  active: string;
  selected: string;
  scale: number;
  cards?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string) => void;
}) {
  const related = new Set([active]);
  const positions = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (edge.source === active) related.add(edge.target);
    if (edge.target === active) related.add(edge.source);
  }
  const keyboard = (event: KeyboardEvent<SVGGraphicsElement>, id: string, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(id);
    }
    const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (direction) {
      event.preventDefault();
      const nodes =
        event.currentTarget.ownerSVGElement!.querySelectorAll<SVGGraphicsElement>('[data-note]');
      nodes[(index + direction + nodes.length) % nodes.length]?.focus();
    }
  };
  const target = (node: KnowledgeGraphNode, index: number) => ({
    'data-note': node.id,
    className: 'cursor-pointer outline-none',
    role: 'button',
    'aria-label': `Open ${node.title}, ${knowledgeLinkCount(node.degree)}`,
    'aria-pressed': selected === node.id,
    tabIndex: selected ? (selected === node.id ? 0 : -1) : index ? -1 : 0,
    onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
    onFocus: () => onHover(node.id),
    onBlur: () => onHover(''),
    onMouseLeave: () => onHover(''),
    onKeyDown: (event: KeyboardEvent<SVGGraphicsElement>) => keyboard(event, node.id, index),
  });
  return (
    <>
      <g pointerEvents="none" aria-hidden="true">
        {graph.edges.map((edge) => {
          const source = positions.get(edge.source)!;
          const end = positions.get(edge.target)!;
          const highlighted = active === edge.source || active === edge.target;
          const stroke = highlighted ? 'var(--primary)' : 'var(--muted-foreground)';
          return cards ? (
            <path
              key={JSON.stringify([edge.source, edge.target])}
              d={cardEdge(source, end)}
              fill="none"
              stroke={stroke}
              strokeOpacity={active ? (highlighted ? 0.9 : 0.25) : 0.55}
              strokeWidth={1.3}
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <line
              key={JSON.stringify([edge.source, edge.target])}
              x1={source.x}
              y1={source.y}
              x2={end.x}
              y2={end.y}
              stroke={stroke}
              strokeOpacity={active ? (highlighted ? 0.75 : 0.055) : 0.22}
              strokeWidth={highlighted ? 1.5 : 1}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
      {cards
        ? graph.nodes.map((node, index) => {
            const left = node.x - KNOWLEDGE_CARD.width / 2;
            const top = node.y - KNOWLEDGE_CARD.height / 2;
            const chosen = selected === node.id;
            return (
              <g
                key={node.id}
                opacity={!active || related.has(node.id) ? 1 : 0.45}
                data-selected={chosen || undefined}
              >
                <rect
                  x={left}
                  y={top}
                  width={KNOWLEDGE_CARD.width}
                  height={KNOWLEDGE_CARD.height}
                  rx={6}
                  fill={chosen ? 'var(--menu-highlight)' : 'var(--background)'}
                  stroke={chosen || node.id === active ? 'var(--primary)' : 'var(--border)'}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
                <FileTextIcon
                  aria-hidden="true"
                  x={left + 9}
                  y={node.y - 6}
                  width={12}
                  height={12}
                  color="var(--muted-foreground)"
                  pointerEvents="none"
                />
                <g aria-hidden="true" pointerEvents="none">
                  <text
                    x={left + 28}
                    y={node.y - 2}
                    fontSize={12}
                    fontWeight={600}
                    fill="var(--foreground)"
                  >
                    {shortTitle(node.title)}
                  </text>
                  <text x={left + 28} y={node.y + 11} fontSize={11} fill="var(--muted-foreground)">
                    {knowledgeLinkCount(node.degree)}
                  </text>
                </g>
                <rect
                  {...target(node, index)}
                  x={left}
                  y={top}
                  width={KNOWLEDGE_CARD.width}
                  height={KNOWLEDGE_CARD.height}
                  rx={6}
                  fill="transparent"
                  onClick={() => onSelect(node.id)}
                  onMouseEnter={() => onHover(node.id)}
                >
                  <title>
                    {node.title} ({knowledgeLinkCount(node.degree)})
                  </title>
                </rect>
              </g>
            );
          })
        : graph.nodes.map((node, index) => (
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
                {...target(node, index)}
                cx={node.x}
                cy={node.y}
                r={Math.max(node.radius + 3, 7 / scale)}
                fill="transparent"
                onClick={(event) =>
                  onSelect(event.detail ? pointerNote(event, graph, node.id) : node.id)
                }
                onMouseEnter={(event) => onHover(pointerNote(event, graph, node.id))}
                onMouseMove={(event) => onHover(pointerNote(event, graph, node.id))}
              >
                <title>
                  {node.title} ({knowledgeLinkCount(node.degree)})
                </title>
              </circle>
            </g>
          ))}
    </>
  );
});
