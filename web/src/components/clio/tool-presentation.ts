import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { formatDuration } from '@/lib/format';
import type { ClioStatusValue } from './status';

export interface ToolPresentation {
  title: string;
  kind: 'analysis-view' | 'tool';
}

/** Labels and summaries are authored by the provider's presentation contract. */
export function getToolPresentation(tool: ToolInvocation): ToolPresentation {
  return {
    title: getToolActionLabel(tool),
    kind: 'tool',
  };
}

export function isA2uiCatalogLookup(tool: ToolInvocation): boolean {
  if (tool.name !== 'load_skill') return false;
  const input = toolInput(tool);
  if (typeof input?.skill_id === 'string' && input.skill_id.startsWith('a2ui-catalog-'))
    return true;
  const subject = tool.presentation?.blocks.find(
    (block) => block.id === tool.presentation?.subject,
  );
  return (subject?.label || subject?.text || '').startsWith('a2ui-catalog-');
}

function toolInput(tool: ToolInvocation): Record<string, unknown> | undefined {
  const input =
    tool.input !== null && typeof tool.input === 'object' && !Array.isArray(tool.input)
      ? (tool.input as Record<string, unknown>)
      : undefined;
  const kwargs = input?.kwargs;
  return kwargs !== null && typeof kwargs === 'object' && !Array.isArray(kwargs)
    ? (kwargs as Record<string, unknown>)
    : input;
}

/** Keep protocol identifiers in details and use the same operation label everywhere. */
export function getToolActionLabel(tool: ToolInvocation): string {
  if (isA2uiCatalogLookup(tool)) return 'Inspect widget catalog';
  const action = tool.presentation?.action || tool.title || tool.name;
  if (tool.name === 'prepare_execution_runtime' && action === 'Prepare execution runtime')
    return 'Get execution environment';
  if (
    [
      'create_a2ui_surface',
      'update_a2ui_components',
      'update_a2ui_data_model',
      'delete_a2ui_surface',
      'inspect_a2ui_surface',
    ].includes(tool.name)
  ) {
    const legacy: Record<string, string> = {
      'Generate UI element': 'Generate widget',
      'Update UI element': 'Update widget',
      'Delete UI element': 'Delete widget',
      'Inspect UI element': 'Inspect widget',
    };
    return legacy[action] ?? action;
  }
  return action;
}

/** Name the requested catalog section while preserving exact arguments in details. */
export function getToolSubject(tool: ToolInvocation): ToolPresentationBlock | undefined {
  const subject = tool.presentation?.blocks.find(
    (block) =>
      block.id === tool.presentation?.subject && (block.type === 'link' || block.type === 'text'),
  );
  if (!isA2uiCatalogLookup(tool)) return subject;
  const input = toolInput(tool);
  const paths = [input?.file, ...(Array.isArray(input?.files) ? input.files : [])].filter(
    (path): path is string => typeof path === 'string' && Boolean(path),
  );
  const names = paths.map((path) => {
    const component = path.split('#/components/')[1];
    return component ? component.replaceAll('~1', '/').replaceAll('~0', '~') : 'General';
  });
  const label = [...new Set(names)].join(', ') || 'General';
  return { id: subject?.id ?? 'catalog-section', type: 'text', text: label, label };
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

/** Explain an unsuccessful outcome using recorded diagnostics, never payload-status guesses. */
export function getToolFailureDetail(tool: ToolInvocation): string | undefined {
  if (!['failed', 'denied', 'cancelled', 'degraded'].includes(getToolStatus(tool)))
    return undefined;
  const blocks = tool.presentation?.blocks ?? [];
  const errors = blocks
    .filter((block) => block.severity === 'error')
    .map((block) => block.text?.trim() || block.detail?.trim() || block.label?.trim())
    .filter((text): text is string => Boolean(text));
  if (errors.length) return [...new Set(errors)].join('\n');
  if (tool.error?.trim()) return tool.error.trim();
  if (tool.presentation?.diagnostic?.trim()) return tool.presentation.diagnostic.trim();
  const terminal = blocks.find((block) => block.type === 'terminal');
  if (terminal?.timed_out)
    return ['Process timed out.', terminal.text?.trim()].filter(Boolean).join('\n');
  if (terminal?.text?.trim()) return terminal.text.trim();
  if (terminal?.exit_code !== undefined && terminal.exit_code !== null)
    return `Process exited with code ${terminal.exit_code}. No diagnostic output was recorded.`;
  return tool.presentation?.summary?.trim() || 'No failure diagnostic was recorded.';
}

/** Compact operation label with the same qualifying subject used by the transcript row. */
export function getToolActivityTitle(tool: ToolInvocation): string {
  const action = getToolActionLabel(tool);
  const subject = getToolSubject(tool);
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
