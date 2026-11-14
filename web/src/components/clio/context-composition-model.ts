import type { ContextPromptSection, ContextSnapshot, Message } from '@clio/core/v3';
import { humanizeProtocolValue } from './presentation-labels';
import { t } from '@lingui/core/macro';
import { formatLocale } from '@/lib/locale-format';

const LABELS: Record<string, string> = {
  framing: t`Unattributed prompt`,
  system: t`System prompt`,
  tools: t`Tool definitions`,
  conversation: t`Messages`,
  messages: t`Messages`,
  observations: t`Tool results`,
  tool_calls: t`Tool calls`,
  reasoning: t`Reasoning`,
  summary: t`Conversation summary`,
  io: t`Messages and results`,
  other: t`Other context`,
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
  const used =
    typeof context?.used_tokens === 'number'
      ? promptTokens(context, context.used_tokens)
      : context?.live_tokens || summaryEstimate;
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
      label: t`Conversation summary`,
      tokens_estimated: summaryEstimate,
      count: 1,
      items: [],
    });
  const attributed = sections.reduce((sum, section) => sum + section.tokens_estimated, 0);
  if (used > attributed)
    sections.push({
      id: 'unattributed',
      label: t`Unattributed prompt`,
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

/**
 * The whole prompt of the last request. OpenAI-style usage counts cached tokens inside the
 * prompt total; Anthropic-style usage (Claude Code) reports them beside an uncached input
 * count. Cached tokens exceeding the reported total can only mean the latter, so add them.
 */
function promptTokens(context: ContextSnapshot, reported: number): number {
  if (!context.cache_tokens_measured) return reported;
  const cached = (context.cache_read_tokens ?? 0) + (context.cache_write_tokens ?? 0);
  return cached > reported ? reported + cached : reported;
}

export function contextTokens(value: number): string {
  return new Intl.NumberFormat(formatLocale(), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function contextPercent(value: number, limit: number): string {
  if (!limit) return '—';
  const result = (value / limit) * 100;
  return result > 0 && result < 0.1 ? '<0.1%' : `${result.toFixed(1)}%`;
}

/** "16.6K of 1M": the used total against the model's window. */
export function contextUsedSummary(context?: ContextSnapshot, messages: readonly Message[] = []) {
  const { used, limit } = contextComposition(context, messages);
  const usedText = contextTokens(used);
  const limitText = contextTokens(limit);
  return limit ? t`${usedText} of ${limitText}` : t`${usedText} used`;
}
