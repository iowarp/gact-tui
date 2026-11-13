import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ActivityIcon,
  BookOpenIcon,
  CalendarClockIcon,
  ChartLineIcon,
  DatabaseIcon,
  FileDiffIcon,
  FileIcon,
  GlobeIcon,
  HammerIcon,
  LayersIcon,
  ListChecksIcon,
  ListTodoIcon,
  ListTreeIcon,
  MessageCircleQuestionIcon,
  NotebookTextIcon,
  PlayIcon,
  TargetIcon,
} from 'lucide-react';
import { t } from '@lingui/core/macro';

/** Context sits alone at the top; the rest read as what happens now and what this conversation holds. */
export type RailGroup = 'context' | 'now' | 'conversation';

export const RAIL_GROUP_LABELS: Record<Exclude<RailGroup, 'context'>, string> = {
  now: t`Now`,
  conversation: t`In this conversation`,
};

/** Stable section identities keep personal layout choices independent of session data. */
export const SESSION_RAIL_SECTIONS = [
  { id: 'context', label: t`Context`, group: 'context', icon: LayersIcon },
  { id: 'goal', label: t`Goal`, group: 'now', icon: TargetIcon },
  { id: 'questions', label: t`Questions`, group: 'now', icon: MessageCircleQuestionIcon },
  { id: 'plan', label: t`Plan`, group: 'now', icon: NotebookTextIcon },
  { id: 'todos', label: t`Todos`, group: 'now', icon: ListTodoIcon },
  { id: 'running', label: t`Running`, group: 'now', icon: PlayIcon },
  { id: 'schedules', label: t`Schedules`, group: 'now', icon: CalendarClockIcon },
  { id: 'tasks', label: t`Tasks`, group: 'now', icon: ListChecksIcon },
  { id: 'files', label: t`Files`, group: 'conversation', icon: FileIcon },
  { id: 'changes', label: t`Changes`, group: 'conversation', icon: FileDiffIcon },
  { id: 'sources', label: t`Sources`, group: 'conversation', icon: BookOpenIcon },
  { id: 'connected', label: t`Connected sources`, group: 'conversation', icon: DatabaseIcon },
  { id: 'artifacts', label: t`Artifacts`, group: 'conversation', icon: ChartLineIcon },
  { id: 'browser', label: t`Browser pages`, group: 'conversation', icon: GlobeIcon },
  { id: 'plans', label: t`Earlier plans`, group: 'conversation', icon: ListTreeIcon },
  { id: 'runs', label: t`Agent runs`, group: 'conversation', icon: ActivityIcon },
  { id: 'tools', label: t`Tool calls`, group: 'conversation', icon: HammerIcon },
] as const satisfies readonly {
  id: string;
  label: string;
  group: RailGroup;
  icon: LucideIcon;
}[];

export type SessionRailSectionId = (typeof SESSION_RAIL_SECTIONS)[number]['id'];
export type SessionRailSection = (typeof SESSION_RAIL_SECTIONS)[number];

export function railSection(id: SessionRailSectionId): SessionRailSection {
  return SESSION_RAIL_SECTIONS.find((section) => section.id === id)!;
}

/** The rail's sections in one group, in the person's order. */
export function railGroupSections(
  layout: SessionRailLayout,
  group: RailGroup,
): SessionRailSectionId[] {
  return layout.order.filter((id) => railSection(id).group === group);
}

export interface SessionRailItem {
  id: SessionRailSectionId;
  content: ReactNode;
  count?: number;
  /** Replaces the count in the section row ("2 of 5", "Approved", "+48 -3"). */
  summary?: string;
  /** Shown under the section row whether or not it is open (Context's bar). */
  below?: ReactNode;
  defaultOpen?: boolean;
}

export interface SessionRailLayout {
  order: SessionRailSectionId[];
  hidden: SessionRailSectionId[];
  /** Sections with nothing recorded stay out of the rail until they have something. */
  hideEmpty: boolean;
}

export function defaultSessionRailLayout(): SessionRailLayout {
  return { order: SESSION_RAIL_SECTIONS.map(({ id }) => id), hidden: [], hideEmpty: true };
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

/**
 * Keep the order and visibility of known sections. A section the saved layout
 * lacks (new, or renamed) joins after its nearest earlier default neighbour.
 */
export function normalizeSessionRailLayout(value: unknown): SessionRailLayout {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const order = sectionIds(candidate.order);
  const defaults = defaultSessionRailLayout().order;
  defaults.forEach((id, index) => {
    if (order.includes(id)) return;
    const previous = defaults
      .slice(0, index)
      .reverse()
      .find((earlier) => order.includes(earlier));
    order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, id);
  });
  return {
    order,
    hidden: sectionIds(candidate.hidden),
    hideEmpty: typeof candidate.hideEmpty === 'boolean' ? candidate.hideEmpty : true,
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
