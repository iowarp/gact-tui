import type { Session } from '@clio/core/v3';
import {
  BotIcon,
  CircleHelpIcon,
  FolderCheckIcon,
  Globe2Icon,
  MapIcon,
  PlayIcon,
  RadarIcon,
  ShieldOffIcon,
  type LucideIcon,
} from 'lucide-react';

export type SessionBehaviorPatch = Partial<
  Pick<Session, 'mode' | 'edit_mode' | 'routing_mode' | 'approval_mode'>
>;

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
    description: 'Act on the request and make supported changes.',
    icon: PlayIcon,
  },
  {
    value: 'plan',
    label: 'Plan',
    description: 'Develop a concrete approach before changing anything.',
    icon: MapIcon,
  },
  {
    value: 'architect',
    label: 'Deep research',
    description: 'Investigate broadly through specialists before proposing changes.',
    icon: Globe2Icon,
  },
] satisfies readonly SessionBehaviorOption<Session['mode']>[];

export const SESSION_APPROVAL_OPTIONS = [
  {
    value: 'ask',
    label: 'Ask first',
    description: 'Pause before protected actions.',
    icon: CircleHelpIcon,
  },
  {
    value: 'auto-edits',
    label: 'Workspace edits',
    description: 'Make workspace edits without a separate confirmation.',
    icon: FolderCheckIcon,
  },
  {
    value: 'ai-review',
    label: 'AI review',
    description: 'Continue when automated review accepts the action.',
    icon: BotIcon,
  },
  {
    value: 'spotter-ai',
    label: 'SPOTTER review',
    description: 'Require the configured SPOTTER policy.',
    icon: RadarIcon,
  },
  {
    value: 'bypass',
    label: 'Bypass checks',
    description: 'Do not stop for supported action checks.',
    icon: ShieldOffIcon,
  },
] satisfies readonly SessionBehaviorOption<Session['approval_mode']>[];

export const SESSION_MODE_PATCHES: Record<Session['mode'], SessionBehaviorPatch> = {
  edit: { mode: 'edit', routing_mode: 'auto' },
  plan: { mode: 'plan', routing_mode: 'auto' },
  architect: { mode: 'architect', routing_mode: 'experts' },
};

export function sessionModeLabel(mode: Session['mode']): string {
  return SESSION_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? 'Execute';
}
