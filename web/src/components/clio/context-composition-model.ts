import type { ContextPromptSection, ContextSnapshot, Message } from '@clio/core/v3';
import { humanizeProtocolValue } from './presentation-labels';

const LABELS: Record<string, string> = {
  framing: 'Unattributed prompt',
  system: 'System prompt',
  tools: 'Tool definitions',
  conversation: 'Messages',
  messages: 'Messages',
  observations: 'Tool results',
  tool_calls: 'Tool calls',
  reasoning: 'Reasoning',
  summary: 'Conversation summary',
  io: 'Messages and results',
  other: 'Other context',
};

export function contextComposition(
  context: ContextSnapshot | undefined,
  messages: readonly Message[],
) {
  const summaryCharacters = messages
    .flatMap((message) => message.blocks)
    .reduce(
      (sum, block) =>
        sum +
        (block.type === 'injection' && block.source === 'summarization' ? block.text.length : 0),
      0,
    );
  const summaryEstimate = Math.ceil(summaryCharacters / 4);
  const used = context?.used_tokens ?? (context?.live_tokens || summaryEstimate);
  const limit = context?.limit_tokens ?? 0;
  const breakdown = context?.prompt_breakdown;
  const sections: ContextPromptSection[] =
    (breakdown ? [...breakdown.sections] : undefined) ??
    Object.entries(context?.categories ?? {})
      .filter(([, tokens]) => tokens > 0)
      .map(([id, tokens]) => ({
        id,
        label: LABELS[id] ?? humanizeProtocolValue(id),
        tokens_estimated: tokens,
        count: 0,
        items: [],
      }));
  if (!sections.length && summaryEstimate && !context?.used_tokens && !context?.live_tokens)
    sections.push({
      id: 'summary',
      label: 'Conversation summary',
      tokens_estimated: summaryEstimate,
      count: 1,
      items: [],
    });
  const attributed = sections.reduce((sum, section) => sum + section.tokens_estimated, 0);
  if (used > attributed)
    sections.push({
      id: 'unattributed',
      label: 'Unattributed prompt',
      tokens_estimated: used - attributed,
      count: 0,
      items: [],
    });
  const remaining = Math.max(0, limit - used);
  const reserve =
    context?.autocompact_enabled === false
      ? 0
      : Math.min(remaining, Math.round(limit * (1 - (context?.autocompact_pct ?? 0.85))));
  return {
    used,
    limit,
    sections,
    reserve,
    free: remaining - reserve,
    estimated: context?.used_tokens_source !== 'provider',
    estimateMismatch: Boolean(breakdown && attributed > used),
  };
}

export function contextTokens(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function contextPercent(value: number, limit: number): string {
  if (!limit) return '—';
  const result = (value / limit) * 100;
  return result > 0 && result < 0.1 ? '<0.1%' : `${result.toFixed(1)}%`;
}
