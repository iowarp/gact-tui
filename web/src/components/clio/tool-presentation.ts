import type { ToolInvocation, ToolState } from '@clio/core/v3';
import { PRESENTATION_OVERRIDE_REGISTRY } from '@/lib/presentation-override-registry';
import { reportPresentationOverride } from '@/lib/presentation-overrides';

export interface ToolPresentation {
  title: string;
  kind: 'analysis-view' | 'tool';
}

const CURATED_TOOL_TITLES: Readonly<Record<string, string>> = {
  tool_call: 'Tool calls',
  pandas_filter_data: 'Filter data',
  pandas_profile_csv: 'Profile data',
  ndp_stage_resource: 'Stage dataset',
  geo_filter_points_by_radius: 'Filter points by radius',
  plot_plot_timeseries: 'Plot time series',
  plot_timeseries: 'Plot time series',
  ndp_search_datasets: 'Search datasets',
};

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
    case 'unknown':
      return 'Analysis view status unknown';
  }
}

export function getToolPresentation(tool: ToolInvocation): ToolPresentation {
  if (tool.name === 'create_a2ui_surface') {
    return { title: analysisViewTitle(tool.state), kind: 'analysis-view' };
  }
  const providedTitle = tool.title?.trim();
  return {
    title: providedTitle || humanizeToolName(tool.name),
    kind: 'tool',
  };
}

/** The summary is undefined whenever it would only restate the labeled tool state. */
export function getToolSummary(tool: ToolInvocation): string | undefined {
  if (tool.error) return truncate(normalize(tool.error), 180);
  const intent = toolIntent(tool);
  if (tool.state === 'pending') return intent ? `${intent.present} is queued.` : undefined;
  if (tool.state === 'running') return intent ? `${intent.progressive}…` : undefined;
  if (tool.state === 'denied') return 'The requested action was denied.';
  if (tool.state === 'cancelled') return 'The action was cancelled.';
  const outputSummary = summarizeOutput(tool.output);
  if (intent && tool.state === 'succeeded') {
    return outputSummary && intent.includeOutput
      ? `${intent.past}. ${outputSummary}`
      : `${intent.past}.`;
  }
  if (outputSummary) return outputSummary;
  return tool.state === 'succeeded' ? undefined : 'No result summary was provided.';
}

export function humanizeToolName(name: string): string {
  const parts = name.split(/[._-]+/).filter(Boolean);
  const normalized = parts.map((part) => part.toLowerCase());
  const exact = normalized.join('_');
  const curatedTitle = CURATED_TOOL_TITLES[exact];
  let rendered = curatedTitle;
  if (!rendered && /^(shell_)?(bash|command|exec|execute)$/.test(exact)) rendered = 'Run command';
  if (!rendered && exact === 'fs_propose_edit') rendered = 'Propose file change';
  if (!rendered && exact === 'fs_apply_edit_write') rendered = 'Apply file change';
  if (!rendered && (exact === 'web_search' || exact.endsWith('_web_search')))
    rendered = 'Search web';
  if (!rendered && exact === 'create_a2ui_surface') rendered = 'Create analysis view';
  if (!rendered && exact === 'wait_agent_tasks') rendered = 'Wait for child agents';
  if (!rendered && exact === 'check_agent_tasks') rendered = 'Check child agents';
  if (!rendered && exact === 'observe_agent_tasks') rendered = 'Watch child agents';
  if (!rendered && exact === 'spawn_agent_task') rendered = 'Start child agent';
  if (!rendered && exact === 'spawn_agents_parallel') rendered = 'Start child agents';

  const actionIndex = normalized.findIndex((part) =>
    [
      'answer',
      'create',
      'delete',
      'edit',
      'fetch',
      'find',
      'geocode',
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
  rendered ??= label.charAt(0).toUpperCase() + label.slice(1);
  reportPresentationOverride({
    kind: 'tool-name-humanization',
    entityId: name,
    serverValue: name,
    rendered,
    issue: PRESENTATION_OVERRIDE_REGISTRY['tool-name-humanization'].issue,
  });
  return rendered;
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
