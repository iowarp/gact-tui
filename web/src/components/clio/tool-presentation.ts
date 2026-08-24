import type { ToolInvocation, ToolState } from '@clio/core/v3';
import type { ClioStatusValue } from './status';

export interface ToolPresentation {
  title: string;
  kind: 'analysis-view' | 'tool';
}

export interface ToolOutcomePresentation {
  value: ClioStatusValue;
  label?: string;
  detail?: string;
  domainStatus?: string;
}

function analysisViewTitle(state: ToolState): string {
  switch (state) {
    case 'pending':
      return 'Analysis view queued';
    case 'running':
      return 'Building analysis view';
    case 'succeeded':
      return 'Analysis view created';
    case 'failed':
      return 'Analysis view failed';
    case 'denied':
      return 'Analysis view denied';
    case 'cancelled':
      return 'Analysis view cancelled';
  }
}

export function getToolPresentation(tool: ToolInvocation): ToolPresentation {
  if (tool.name === 'create_a2ui_surface') {
    return { title: analysisViewTitle(tool.state), kind: 'analysis-view' };
  }
  const providedTitle = tool.title?.trim();
  return {
    title:
      providedTitle && !isMachineFacingToolTitle(providedTitle)
        ? providedTitle
        : humanizeToolName(tool.name),
    kind: 'tool',
  };
}

export function getToolSummary(tool: ToolInvocation): string {
  if (tool.error) return truncate(normalize(tool.error), 180);
  const intent = toolIntent(tool);
  if (tool.state === 'pending')
    return intent ? `${intent.present} is queued.` : 'Waiting to start.';
  if (tool.state === 'running') return intent ? `${intent.progressive}…` : 'Running now.';
  if (tool.state === 'denied') return 'The requested action was denied.';
  if (tool.state === 'cancelled') return 'The action was cancelled.';
  const outputSummary = summarizeOutput(tool.output);
  if (intent && tool.state === 'succeeded') {
    return outputSummary && intent.includeOutput
      ? `${intent.past}. ${outputSummary}`
      : `${intent.past}.`;
  }
  if (outputSummary) return outputSummary;
  return tool.state === 'succeeded' ? 'Completed successfully.' : 'No result summary was provided.';
}

/** Separates successful tool transport from the operation outcome reported in its result. */
export function getToolOutcome(tool: ToolInvocation): ToolOutcomePresentation {
  if (tool.state !== 'succeeded') return { value: tool.state };

  const output = asRecord(tool.output);
  const domainStatus = firstString(output, ['status', 'state', 'outcome']);
  if (!domainStatus) return { value: 'completed', label: 'Completed' };

  const normalized = domainStatus
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, '_');
  const detail = `Tool execution succeeded; the operation reported ${domainStatus}.`;
  if (['completed', 'complete', 'success', 'succeeded', 'ok', 'ready'].includes(normalized)) {
    return { value: 'completed', label: 'Completed', detail, domainStatus };
  }
  if (['halted', 'stopped'].includes(normalized)) {
    return { value: 'interrupted', label: 'Halted', detail, domainStatus };
  }
  if (['quarantined', 'quarantine'].includes(normalized)) {
    return { value: 'interrupted', label: 'Quarantined', detail, domainStatus };
  }
  if (['blocked', 'paused', 'partial', 'degraded', 'warning'].includes(normalized)) {
    return {
      value: 'degraded',
      label: sentenceCase(domainStatus),
      detail,
      domainStatus,
    };
  }
  if (['failed', 'failure', 'error'].includes(normalized)) {
    return { value: 'failed', label: 'Failed', detail, domainStatus };
  }
  if (['cancelled', 'canceled'].includes(normalized)) {
    return { value: 'cancelled', label: 'Cancelled', detail, domainStatus };
  }
  if (['waiting', 'waiting_user', 'awaiting_input'].includes(normalized)) {
    return { value: 'waiting_user', label: 'Waiting for you', detail, domainStatus };
  }
  return {
    value: 'degraded',
    label: sentenceCase(domainStatus),
    detail,
    domainStatus,
  };
}

export function humanizeToolName(name: string): string {
  const parts = name.split(/[._-]+/).filter(Boolean);
  const normalized = parts.map((part) => part.toLowerCase());
  const exact = normalized.join('_');
  if (/^(shell_)?(bash|command|exec|execute)$/.test(exact)) return 'Run command';
  if (exact === 'fs_propose_edit') return 'Propose file change';
  if (exact === 'fs_apply_edit_write') return 'Apply file change';
  if (exact === 'web_search' || exact.endsWith('_web_search')) return 'Search web';
  if (exact === 'create_a2ui_surface') return 'Create analysis view';
  if (exact === 'wait_agent_tasks') return 'Wait for child agents';
  if (exact === 'check_agent_tasks') return 'Check child agents';
  if (exact === 'observe_agent_tasks') return 'Watch child agents';
  if (exact === 'spawn_agent_task') return 'Start child agent';
  if (exact === 'spawn_agents_parallel') return 'Start child agents';

  const actionIndex = normalized.findIndex((part) =>
    [
      'answer',
      'create',
      'delete',
      'edit',
      'fetch',
      'find',
      'get',
      'list',
      'open',
      'query',
      'read',
      'remove',
      'run',
      'search',
      'submit',
      'update',
      'write',
    ].includes(part),
  );
  if (actionIndex > 0) {
    parts.splice(0, actionIndex);
  } else if (parts.length > 1 && ['fs', 'mcp', 'tool', 'tools'].includes(parts[0]!.toLowerCase())) {
    parts.shift();
  }
  const label = parts.join(' ').trim() || 'Tool activity';
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function isMachineFacingToolTitle(title: string): boolean {
  return /^[a-z][a-z0-9_.-]*(?:\([a-z0-9_., -]*\))?$/u.test(title);
}

interface ToolIntent {
  present: string;
  progressive: string;
  past: string;
  includeOutput?: boolean;
}

function toolIntent(tool: ToolInvocation): ToolIntent | undefined {
  const name = tool.name.toLowerCase();
  const input = asRecord(tool.input);
  const path = firstString(input, ['path', 'file_path', 'filename', 'target']);
  const subject = path ? fileName(path) : undefined;

  if (/(^|[_.-])read([_.-]|$)/.test(name) && /(file|fs)/.test(name)) {
    return verbIntent('Read', 'Reading', 'Read', subject);
  }
  if (/(^|[_.-])(write|edit|patch|update)([_.-]|$)/.test(name) && /(file|fs)/.test(name)) {
    return verbIntent('Update', 'Updating', 'Updated', subject);
  }
  if (/(^|[_.-])(delete|remove)([_.-]|$)/.test(name) && /(file|fs)/.test(name)) {
    return verbIntent('Remove', 'Removing', 'Removed', subject);
  }
  if (/(shell|bash|command|exec)/.test(name)) {
    const command = firstString(input, ['command', 'cmd', 'script']);
    return verbIntent(
      'Run',
      'Running',
      'Ran',
      command ? truncate(normalize(command), 72) : 'command',
    );
  }
  if (/(search|query)/.test(name)) {
    const query = firstString(input, ['query', 'q', 'pattern', 'search']);
    return {
      ...verbIntent('Search for', 'Searching for', 'Searched for', query),
      includeOutput: true,
    };
  }
  if (/(^|[_.-])create([_.-]|$)/.test(name) && /artifact/.test(name)) {
    const artifactName = firstString(input, ['name', 'path', 'filename']);
    return verbIntent(
      'Create',
      'Creating',
      'Created',
      artifactName ? fileName(artifactName) : 'artifact',
    );
  }
  if (name === 'create_a2ui_surface') {
    return verbIntent('Create', 'Creating', 'Created', 'analysis view');
  }
  return undefined;
}

export function formatToolDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1).replace(/\.0$/u, '')} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1_000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

function verbIntent(
  presentVerb: string,
  progressiveVerb: string,
  pastVerb: string,
  subject = '',
): ToolIntent {
  const suffix = subject ? ` ${subject}` : '';
  return {
    past: `${pastVerb}${suffix}`,
    present: `${presentVerb}${suffix}`,
    progressive: `${progressiveVerb}${suffix}`,
  };
}

function summarizeOutput(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = normalize(value);
    if (!normalized) return undefined;
    if (normalized.startsWith('{') || normalized.startsWith('[')) {
      try {
        return summarizeOutput(JSON.parse(normalized));
      } catch {
        // Preserve non-JSON tool output as a bounded human-readable excerpt.
      }
    }
    return truncate(normalized, 180);
  }
  const output = asRecord(value);
  if (!output) return undefined;
  for (const key of ['message', 'detail', 'result']) {
    if (typeof output[key] === 'string' && output[key]) {
      return truncate(normalize(output[key]), 180);
    }
  }
  if (typeof output.summary === 'string' && output.summary) {
    return truncate(normalize(output.summary), 180);
  }

  const structured = summarizeStructuredOutput(output);
  if (structured) return structured;

  for (const key of ['path', 'status']) {
    if (typeof output[key] === 'string' && output[key]) {
      return truncate(normalize(output[key]), 180);
    }
  }
  const count = ['count', 'total', 'matches', 'items'].find(
    (key) => typeof output[key] === 'number',
  );
  return count ? `${String(output[count])} ${count === 'items' ? 'items' : 'results'}.` : undefined;
}

function summarizeStructuredOutput(output: Record<string, unknown>): string | undefined {
  const summary = asRecord(output.summary);
  const status = firstString(output, ['status', 'state', 'outcome'])?.toLowerCase();
  const explicitRunCount = firstNumber(output, ['run_count', 'runs_completed']);
  const nestedRunCount = firstNumber(summary, ['run_count', 'runs_completed']);
  const arrayRunCount = Array.isArray(output.runs) ? output.runs.length : undefined;
  const runCount = explicitRunCount ?? nestedRunCount ?? arrayRunCount;
  const parts: string[] = [];

  if (runCount !== undefined && runCount > 0) {
    parts.push(
      ['completed', 'complete', 'succeeded', 'success'].includes(status ?? '')
        ? `${runCount} ${runCount === 1 ? 'run' : 'runs'} completed`
        : `${runCount} ${runCount === 1 ? 'run' : 'runs'} recorded`,
    );
  }

  if (typeof output.quarantined === 'boolean') {
    parts.push(output.quarantined ? 'quarantine active' : 'quarantine cleared');
  }

  if (summary) {
    for (const [key, metric] of Object.entries(summary)) {
      if (['run_count', 'runs_completed'].includes(key) || typeof metric !== 'number') continue;
      parts.push(`${humanizeMetricKey(key)} ${formatMetric(metric)}`);
      if (parts.length >= 3) break;
    }
  }

  return parts.length ? `${parts.join(', ')}.` : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstString(
  value: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    if (typeof value?.[key] === 'string' && value[key]) return value[key];
  }
  return undefined;
}

function firstNumber(
  value: Record<string, unknown> | undefined,
  keys: readonly string[],
): number | undefined {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

function humanizeMetricKey(key: string): string {
  const label = key.replace(/_avg$/u, '').replace(/_/gu, ' ');
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function formatMetric(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function sentenceCase(value: string): string {
  const label = value.replace(/[_-]+/gu, ' ').trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}
