import type { ToolInvocation } from '@clio/core/v3';
import { formatDuration } from '@/lib/format';

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

/** An undeclared tool keeps its actual identifier as the fallback label. */
export function humanizeToolName(name: string): string {
  return name;
}

export function formatToolDuration(durationMs: number): string {
  return formatDuration(durationMs);
}
