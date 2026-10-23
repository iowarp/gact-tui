import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Stable section identities keep personal layout choices independent of session data. */
export const SESSION_RAIL_SECTIONS = [
  { id: 'context', label: 'Context' },
  { id: 'goal', label: 'Goal and work' },
  { id: 'connected', label: 'Connected sources' },
  { id: 'questions', label: 'Open questions' },
  { id: 'todos', label: 'Todos' },
  { id: 'background', label: 'Background tasks' },
  { id: 'child-agents', label: 'Child agents' },
  { id: 'artifacts', label: 'Artifacts' },
  { id: 'files', label: 'Files' },
  { id: 'changes', label: 'Changed files' },
  { id: 'sources', label: 'Sources' },
  { id: 'plans', label: 'Plans' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'runs', label: 'Agent runs' },
  { id: 'tools', label: 'Tool calls' },
] as const;

export type SessionRailSectionId = (typeof SESSION_RAIL_SECTIONS)[number]['id'];
export type RailKind = 'session' | 'work';
const WORK_SECTIONS: readonly SessionRailSectionId[] = [
  'goal',
  'questions',
  'todos',
  'background',
  'child-agents',
  'plans',
  'tasks',
  'schedules',
  'runs',
];

/** Session evidence and ongoing work retain separate inventories and launchers. */
export function railSectionIds(kind: RailKind): SessionRailSectionId[] {
  return SESSION_RAIL_SECTIONS.map(({ id }) => id).filter(
    (id) => WORK_SECTIONS.includes(id) === (kind === 'work'),
  );
}
export interface SessionRailItem {
  id: SessionRailSectionId;
  content: ReactNode;
  count?: number;
  summary?: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
}
export interface SessionRailLayout {
  order: SessionRailSectionId[];
  hidden: SessionRailSectionId[];
}

export function defaultSessionRailLayout(): SessionRailLayout {
  return { order: SESSION_RAIL_SECTIONS.map(({ id }) => id), hidden: [] };
}

function sectionIds(value: unknown): SessionRailSectionId[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((id): id is SessionRailSectionId =>
            SESSION_RAIL_SECTIONS.some((section) => section.id === id),
          ),
        ),
      ]
    : [];
}

/** Append new sections without losing the order or visibility of known sections. */
export function normalizeSessionRailLayout(value: unknown): SessionRailLayout {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const order = sectionIds(candidate.order);
  return {
    order: [...order, ...defaultSessionRailLayout().order.filter((id) => !order.includes(id))],
    hidden: sectionIds(candidate.hidden),
  };
}

/** Reorder the shown subset while preserving hidden and currently absent sections. */
export function reorderSessionRail(
  layout: SessionRailLayout,
  shown: readonly SessionRailSectionId[],
): SessionRailLayout {
  let index = 0;
  return {
    ...layout,
    order: layout.order.map((id) => (shown.includes(id) ? shown[index++]! : id)),
  };
}
