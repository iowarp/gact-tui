/**
 * State model for the discovery agent detail panel: loads and shapes a single
 * agent's metadata for display.
 */
import type { AgentDef } from '@clio/core';

export type AgentDetail = AgentDef & Record<string, unknown>;

export interface AgentDetailViewModel {
  source: string;
  tier: string;
  focus?: string;
  model?: string;
  tools: string[];
  keywords: string[];
  routing: Array<[string, string]>;
  metadata: Array<[string, string]>;
}

export function agentDetailViewModel(
  agent: AgentDef,
  detail: AgentDetail,
): AgentDetailViewModel {
  return {
    source: firstString(detail.source) ?? 'backend',
    tier:
      typeof detail.tier === 'number'
        ? `tier ${detail.tier}`
        : typeof agent.tier === 'number'
          ? `tier ${agent.tier}`
          : 'unreported',
    focus: firstString(detail.specialization, agent.specialization),
    model: firstString(
      detail.default_model,
      detail.model,
      detail.model_id,
      detail.provider_id,
    ),
    tools: uniqueStrings(detail.tools ?? agent.tools ?? []),
    keywords: uniqueStrings(detail.keywords ?? agent.keywords ?? []).map(
      (keyword) => `#${keyword}`,
    ),
    routing: formattedObjectEntries(
      detail.routing ??
        detail.routing_rules ??
        detail.delegation ??
        detail.handoffs ??
        null,
    ),
    metadata: formattedObjectEntries(detail.metadata),
  };
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === 'string' && value.trim().length > 0,
      ),
    ),
  ];
}

function formattedObjectEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue != null)
    .map(([key, entryValue]) => [humanKey(key), formatDetailValue(entryValue)]);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function humanKey(key: string): string {
  return key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDetailValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string');
    if (strings.length === value.length && strings.length <= 6) return strings.join(', ');
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (value && typeof value === 'object') {
    const count = Object.keys(value as Record<string, unknown>).length;
    return count > 0 ? `${count} field${count === 1 ? '' : 's'}` : 'configured';
  }
  return 'unreported';
}
