import type { MessageBehavior, Session } from '@clio/core/v3';
import {
  BotIcon,
  FolderCheckIcon,
  GlobeIcon,
  MapIcon,
  PlayIcon,
  RadarIcon,
  ShieldOffIcon,
  type LucideIcon,
} from 'lucide-react';
import { HelpIcon } from '@/lib/icon-vocabulary';
import { t } from '@lingui/core/macro';

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
    label: t`Execute`,
    description: t`Does the work, within the policy.`,
    icon: PlayIcon,
  },
  {
    value: 'plan',
    label: t`Plan`,
    description: t`Proposes a plan and waits for you.`,
    icon: MapIcon,
  },
  {
    value: 'architect',
    label: t`Deep research`,
    description: t`A long, sourced investigation.`,
    icon: GlobeIcon,
  },
] satisfies readonly SessionBehaviorOption<Session['mode']>[];

export const SESSION_APPROVAL_OPTIONS = [
  {
    value: 'ask',
    label: t`Ask first`,
    description: t`Ask before edits or commands.`,
    icon: HelpIcon,
  },
  {
    value: 'auto-edits',
    label: t`Workspace edits`,
    description: t`Edit files without asking.`,
    icon: FolderCheckIcon,
  },
  {
    value: 'ai-review',
    label: t`AI review`,
    description: t`Let AI review each action.`,
    icon: BotIcon,
  },
  {
    value: 'spotter-ai',
    label: t`SPOTTER review`,
    description: t`An AI agent watches the session.`,
    icon: RadarIcon,
  },
  {
    value: 'bypass',
    label: t`Bypass checks`,
    description: t`Run without asking.`,
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
  return SESSION_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? t`Unknown mode`;
}
