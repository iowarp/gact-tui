import type { MessageBehavior, Session } from '@clio/core/v3';
import {
  BotIcon,
  FolderCheckIcon,
  Globe2Icon,
  MapIcon,
  PlayIcon,
  RadarIcon,
  ShieldOffIcon,
  type LucideIcon,
} from 'lucide-react';
import { HelpIcon } from '@/lib/icon-vocabulary';

export type SessionBehaviorPatch = Partial<
  Pick<Session, 'mode' | 'edit_mode' | 'routing_mode' | 'approval_mode'>
> & {
  /** SPOTTER review's fleet model (`<account>/<model>`); empty uses the conversation's. */
  spotter_model?: string;
};

export interface SessionBehaviorOption<T extends string> {
  value: T;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const SESSION_MODE_OPTIONS = [
  {
    value: 'edit',
    label: 'Execute',
    description: 'Does the work, within the policy.',
    icon: PlayIcon,
  },
  {
    value: 'plan',
    label: 'Plan',
    description: 'Proposes a plan and waits for you.',
    icon: MapIcon,
  },
  {
    value: 'architect',
    label: 'Deep research',
    description: 'A long, sourced investigation.',
    icon: Globe2Icon,
  },
] satisfies readonly SessionBehaviorOption<Session['mode']>[];

export const SESSION_APPROVAL_OPTIONS = [
  {
    value: 'ask',
    label: 'Ask first',
    description: 'Ask before edits or commands.',
    icon: HelpIcon,
  },
  {
    value: 'auto-edits',
    label: 'Workspace edits',
    description: 'Edit files without asking.',
    icon: FolderCheckIcon,
  },
  {
    value: 'ai-review',
    label: 'AI review',
    description: 'Let AI review each action.',
    icon: BotIcon,
  },
  {
    value: 'spotter-ai',
    label: 'SPOTTER review',
    description: 'An AI agent watches the session.',
    icon: RadarIcon,
  },
  {
    value: 'bypass',
    label: 'Bypass checks',
    description: 'Run without asking.',
    icon: ShieldOffIcon,
  },
] satisfies readonly SessionBehaviorOption<Session['approval_mode']>[];

export const SESSION_MODE_PATCHES: Record<Session['mode'], SessionBehaviorPatch> = {
  edit: { mode: 'edit', routing_mode: 'auto' },
  plan: { mode: 'plan', routing_mode: 'auto' },
  architect: { mode: 'architect', routing_mode: 'experts' },
  unknown: {},
};

/** Translate composer behavior into the authoritative session patch it represents. */
export function sessionPatchForMessageBehavior(behavior: MessageBehavior): SessionBehaviorPatch {
  const mode =
    behavior.execution_mode === 'plan'
      ? 'plan'
      : behavior.execution_mode === 'deep_research'
        ? 'architect'
        : 'edit';
  return { ...SESSION_MODE_PATCHES[mode], approval_mode: behavior.confirmation_policy };
}

export function sessionModeLabel(mode: Session['mode']): string {
  return SESSION_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? 'Unknown mode';
}
