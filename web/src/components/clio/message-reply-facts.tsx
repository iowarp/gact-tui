import type { Message, MessageBehavior } from '@clio/core/v3';
import {
  BotIcon,
  Clock3Icon,
  CoinsIcon,
  TextIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { brand } from '@brand';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { AdjustIcon } from '@/lib/icon-vocabulary';
import { formatNumber } from '@/lib/locale-format';
import { providerDisplayName, providerLogoId } from '@/lib/provider-presentation';
import type { KeyValueItem } from './primitives/key-value-grid';
import { SESSION_APPROVAL_OPTIONS, SESSION_MODE_OPTIONS } from './session-behavior-options';
export interface ReplyToolCounts {
  toolCount: number;
  failedToolCount?: number;
}

/** The provider's mark at icon size, colored by its surroundings. */
export function replyModelIcon(providerId: string): ReactElement {
  return (
    <ModelSelectorLogo
      aria-hidden="true"
      className="size-3.5 rounded-none bg-transparent text-current [&>span]:size-3.5"
      provider={providerLogoId(providerId)}
    />
  );
}

export function compactTokens(value: number): string {
  return value >= 1000 ? `${formatNumber(value / 1000, 1)}K` : formatNumber(value);
}

/** "18.4K in, 212 out": what this reply read and wrote, from the message itself. */
export function replyTokens(message: Message): string | undefined {
  const usage = message.usage;
  if (!usage || (usage.input <= 0 && usage.output <= 0)) return undefined;
  return `${compactTokens(usage.input)} in, ${compactTokens(usage.output)} out`;
}

/** Wall time from the message's start to its recorded completion. */
export function replyDuration(message: Message): string | undefined {
  if (!message.completed_at) return undefined;
  const elapsed = Date.parse(message.completed_at) - Date.parse(message.created_at);
  if (!Number.isFinite(elapsed) || elapsed < 0) return undefined;
  const seconds = Math.round(elapsed / 1000);
  if (seconds < 60) return `${Math.max(seconds, elapsed > 0 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 ? `${minutes}m ${seconds % 60}s` : `${minutes}m`;
  return minutes % 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes / 60}h`;
}

function messageBehavior(message: Message): Partial<MessageBehavior> {
  const behavior = message.metadata?.behavior;
  return behavior && typeof behavior === 'object' && !Array.isArray(behavior)
    ? (behavior as Partial<MessageBehavior>)
    : {};
}

const MODE_VALUES: Record<MessageBehavior['execution_mode'], string> = {
  execute: 'edit',
  plan: 'plan',
  deep_research: 'architect',
};

function icon(Glyph: LucideIcon) {
  return <Glyph aria-hidden="true" />;
}

/** The main agent's runtime id ("main") is internal; the reader sees the product's name. */
function agentDisplayName(agentName: string | undefined): string {
  const name = agentName?.trim();
  return !name || name.toLowerCase() === 'main' ? brand.name : name;
}

/** The setup and usage this reply recorded. Only facts the message carries become rows. */
export function replyUsedRows(
  message: Message,
  agentName: string | undefined,
  { toolCount, failedToolCount = 0 }: ReplyToolCounts,
): { setup: KeyValueItem[]; usage: KeyValueItem[] } {
  const behavior = messageBehavior(message);
  const mode = behavior.execution_mode
    ? SESSION_MODE_OPTIONS.find((option) => option.value === MODE_VALUES[behavior.execution_mode!])
    : undefined;
  const approval = SESSION_APPROVAL_OPTIONS.find(
    (option) => option.value === behavior.confirmation_policy,
  );
  const setup: KeyValueItem[] = [
    { label: 'Agent', icon: icon(BotIcon), value: agentDisplayName(agentName) },
  ];
  if (message.model)
    setup.push({
      label: 'Model',
      icon: replyModelIcon(message.model.provider_id),
      value: `${providerDisplayName(undefined, message.model.provider_id)} / ${message.model.model_id}`,
    });
  if (mode) setup.push({ label: 'Mode', icon: icon(mode.icon), value: mode.label });
  if (behavior.reasoning_effort)
    setup.push({
      label: 'Reasoning',
      icon: icon(AdjustIcon),
      value:
        behavior.reasoning_effort === 'xhigh'
          ? 'Extra high'
          : `${behavior.reasoning_effort.charAt(0).toUpperCase()}${behavior.reasoning_effort.slice(1)}`,
    });
  if (approval)
    setup.push({ label: 'Permissions', icon: icon(approval.icon), value: approval.label });

  const usage: KeyValueItem[] = [];
  const tokens = replyTokens(message);
  if (tokens)
    usage.push({
      label: 'Tokens',
      icon: icon(TextIcon),
      value: message.usage?.cache_read
        ? `${tokens}, ${compactTokens(message.usage.cache_read)} cached`
        : tokens,
    });
  if (message.cost_usd !== undefined)
    usage.push({
      label: 'Cost',
      icon: icon(CoinsIcon),
      value: `$${formatNumber(message.cost_usd, 4)}`,
    });
  if (toolCount > 0)
    usage.push({
      label: 'Tools',
      icon: icon(WrenchIcon),
      value: `${toolCount} ${toolCount === 1 ? 'tool call' : 'tool calls'}${failedToolCount > 0 ? `, ${failedToolCount} failed` : ''}`,
    });
  const duration = replyDuration(message);
  if (duration) usage.push({ label: 'Time', icon: icon(Clock3Icon), value: duration });
  return { setup, usage };
}
