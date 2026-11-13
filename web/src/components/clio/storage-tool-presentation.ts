import type { ToolInvocation } from '@clio/core/v3';
import { ph, t } from '@lingui/core/macro';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function submissionResult(output: unknown): Record<string, unknown> | undefined {
  // Earlier native returns were retained as a JSON text part, rather than a mapping.
  if (Array.isArray(output) && output.length === 1) output = record(output[0])?.text;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return undefined;
    }
  }
  const outer = record(output);
  return record(outer?.structuredContent) ?? record(outer?.structured_content) ?? outer;
}

type SubmissionKind = 'Indexing' | 'Download' | 'Task';
type SubmissionOutcome = 'completed' | 'unsuccessful' | 'requested';

const SUBMISSION_KIND_LABELS: Record<SubmissionKind, string> = {
  Indexing: t`Indexing`,
  Download: t`Download`,
  Task: t`Task`,
};

/** "Download completed", "Task requested": one phrase per kind and outcome. */
function submissionSummary(kind: SubmissionKind, outcome: SubmissionOutcome): string {
  switch (kind) {
    case 'Indexing':
      return outcome === 'completed'
        ? t`Indexing completed`
        : outcome === 'unsuccessful'
          ? t`Indexing unsuccessful`
          : t`Indexing requested`;
    case 'Download':
      return outcome === 'completed'
        ? t`Download completed`
        : outcome === 'unsuccessful'
          ? t`Download unsuccessful`
          : t`Download requested`;
    case 'Task':
      return outcome === 'completed'
        ? t`Task completed`
        : outcome === 'unsuccessful'
          ? t`Task unsuccessful`
          : t`Task requested`;
  }
}

/** Repair legacy source receipts using their recorded task acceptance, without rerunning them. */
export function withStorageToolPresentation(tool: ToolInvocation): ToolInvocation {
  const captureSummary = tool.presentation?.summary;
  if (
    tool.name === 'connected_data_ndp_endpoint_request' &&
    captureSummary &&
    /^\d+ bytes captured \u00b7 /u.test(captureSummary)
  )
    return {
      ...tool,
      presentation: {
        ...tool.presentation,
        summary: captureSummary.replace(' \u00b7 ', ', '),
        blocks: tool.presentation?.blocks ?? [],
      },
    };
  if (
    !['connected_data_connect', 'connected_data_download'].includes(tool.name) ||
    tool.state !== 'succeeded'
  )
    return tool;
  const summary = tool.presentation?.summary;
  // i18n-ignore: summaries the service recorded, compared as written
  if (summary && !['Connected data is unavailable', '0 task outcomes'].includes(summary))
    return tool;
  const row = submissionResult(tool.output);
  if (row?.accepted !== true || typeof row.handle !== 'string' || !row.handle.trim()) return tool;
  const kind: SubmissionKind =
    row.kind === 'Indexing' || row.kind === 'Download' ? row.kind : 'Task';
  const completed = row.status === 'completed';
  const failed = ['failed', 'cancelled', 'interrupted', 'denied', 'error'].includes(
    String(row.status),
  );
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      summary: submissionSummary(
        kind,
        completed ? 'completed' : failed ? 'unsuccessful' : 'requested',
      ),
      ...(failed ? { status: 'degraded' } : {}),
      blocks: [
        {
          id: 'task-submission',
          type: 'text',
          label:
            typeof row.description === 'string' ? row.description : SUBMISSION_KIND_LABELS[kind],
          text: t`Task: ${ph({ handle: row.handle })}`,
          status: completed || failed ? String(row.status) : 'pending',
          result_kind: completed || failed ? 'completion' : 'snapshot',
          ...(failed ? { severity: 'error' } : {}),
        },
      ],
    },
  };
}
