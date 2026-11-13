import type { ScienceEntry } from '@clio/core/v3';
import {
  BotIcon,
  CheckIcon,
  EyeIcon,
  FlaskConicalIcon,
  GitBranchIcon,
  LayoutGridIcon,
  LightbulbIcon,
  LoaderCircleIcon,
  MessageCircleQuestionMarkIcon,
  ScaleIcon,
  ShuffleIcon,
  SwordsIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScienceState, StudyNode } from './science-log-model';

const ENTRY_ICON: Record<ScienceEntry['type'], LucideIcon> = {
  question: MessageCircleQuestionMarkIcon,
  hypothesis: LightbulbIcon,
  experiment: FlaskConicalIcon,
  observation: EyeIcon,
  evidence: ScaleIcon,
  reframe: ShuffleIcon,
  conclusion: CheckIcon,
  conflict: SwordsIcon,
  view: LayoutGridIcon,
  unknown: EyeIcon,
};

/** The entry's kind as a glyph; the row's accessible name carries the kind in text. */
export function EntryKindIcon({
  type,
  className,
}: {
  type: ScienceEntry['type'];
  className?: string;
}) {
  const Icon = ENTRY_ICON[type] ?? EyeIcon;
  return <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', className)} />;
}

/** A study-list node's glyph: the question, a hypothesis or reframe, a delegated agent or a fork. */
export function StudyNodeIcon({ node, className }: { node: StudyNode; className?: string }) {
  const Icon =
    node.kind === 'question'
      ? MessageCircleQuestionMarkIcon
      : node.kind === 'hypothesis'
        ? LightbulbIcon
        : node.kind === 'reframe'
          ? ShuffleIcon
          : node.branchRelation === 'fork' || node.branchRelation === 'branch'
            ? GitBranchIcon
            : BotIcon;
  return <Icon aria-hidden="true" className={cn('size-3.5 shrink-0', className)} />;
}

/** The state word: always text; supported and refuted tinted, running with a spinner. */
export function ScienceStatus({ state, className }: { state: ScienceState; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-end gap-1 text-label leading-4 text-muted-foreground',
        state.tone === 'supported' && 'text-status-supported-foreground',
        state.tone === 'refuted' && 'text-destructive',
        className,
      )}
      data-tone={state.tone}
    >
      {state.tone === 'running' ? (
        <LoaderCircleIcon aria-hidden="true" className="size-3 motion-safe:animate-spin" />
      ) : null}
      {state.label}
    </span>
  );
}
