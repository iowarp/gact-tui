import type { ToolInvocation } from '@clio/core/v3';
import { formatDuration } from '@/lib/format';
import type { ClioStatusValue } from './status';

export interface ToolPresentation {
  title: string;
  kind: 'analysis-view' | 'tool';
}

/** Labels and summaries are authored by the provider's presentation contract. */
export function getToolPresentation(tool: ToolInvocation): ToolPresentation {
  return { title: tool.title || tool.name, kind: 'tool' };
}

export function getToolSummary(tool: ToolInvocation): string | undefined {
  return tool.presentation?.summary || undefined;
}

/** Move compact file facts into the shared trailing header cluster. */
export function getToolHeaderMetadata(tool: ToolInvocation): string | undefined {
  const subject = tool.presentation?.blocks.find(
    (block) => block.id === tool.presentation?.subject,
  );
  const summary = tool.presentation?.summary?.trim() ?? '';
  if (tool.name === 'workspace_resource_search') {
    const input =
      tool.input !== null && typeof tool.input === 'object' && !Array.isArray(tool.input)
        ? (tool.input as Record<string, unknown>)
        : undefined;
    const query = typeof input?.query === 'string' ? input.query.trim() : '';
    if (query) return `for “${query}”`;
  }
  return subject?.target === 'file' && /^\d[\d,]*\s+bytes?$/iu.test(summary) ? summary : undefined;
}

const DECLARED_TOOL_STATUSES = new Set<ClioStatusValue>([
  'succeeded',
  'failed',
  'degraded',
  'cancelled',
  'denied',
]);

/** Semantic outcome declared by the tool result, with transport state as fallback. */
export function getToolStatus(tool: ToolInvocation): ClioStatusValue {
  const declared = tool.presentation?.status;
  return declared && DECLARED_TOOL_STATUSES.has(declared as ClioStatusValue)
    ? (declared as ClioStatusValue)
    : tool.state;
}

/** Compact operation label with the same qualifying subject used by the transcript row. */
export function getToolActivityTitle(tool: ToolInvocation): string {
  const action = tool.presentation?.action || tool.title || tool.name;
  const subject = tool.presentation?.blocks.find(
    (block) =>
      block.id === tool.presentation?.subject && (block.type === 'link' || block.type === 'text'),
  );
  const label = subject?.label?.trim();
  return label ? `${action} (${label})` : action;
}

/** An undeclared tool keeps its actual identifier as the fallback label. */
export function humanizeToolName(name: string): string {
  return name;
}

export function formatToolDuration(durationMs: number): string {
  return formatDuration(durationMs);
}
