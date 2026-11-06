import type { ToolInvocation } from '@clio/core/v3';
import { asRecord, toolResultRecord } from './tool-result-shared';

/** Explicit completion fields from known operation schemas, never arbitrary status-word inference. */
export function withOperationOutcome(tool: ToolInvocation): ToolInvocation {
  if (tool.state !== 'succeeded') return tool;
  if (
    tool.presentation?.status &&
    ['succeeded', 'failed', 'degraded', 'denied', 'interrupted', 'cancelled'].includes(
      tool.presentation.status,
    )
  )
    return tool;
  const result = toolResultRecord(tool.output);
  if (!result || result.truncated === true) return tool;
  const web = ['web_search', 'web_fetch'].includes(tool.name) && result.ok === false;
  const command =
    ['shell_bash', 'ssh_execute'].includes(tool.name) &&
    typeof result.exit_code === 'number' &&
    result.exit_code !== 0;
  const refused =
    ['run_flow', 'run_workflow', 'spawn_agent_task'].includes(tool.name) &&
    result.accepted === false;
  const outcomes = Array.isArray(result.outcomes)
    ? result.outcomes
    : Array.isArray(result.results)
      ? result.results
      : [];
  const wait =
    tool.name === 'wait_tasks' &&
    ((Array.isArray(result.errors) && result.errors.length > 0) ||
      outcomes.some((item) => {
        const row = asRecord(item);
        return (
          row &&
          (row.error ||
            [
              'failed',
              'error',
              'denied',
              'cancelled',
              'interrupted',
              'task_state_uncertain',
            ].includes(String(row.status)))
        );
      }));
  if (!web && !command && !refused && !wait) return tool;
  const error = [result.detail, result.error, result.stderr, asRecord(result.reason)?.message].find(
    (value): value is string => typeof value === 'string' && Boolean(value),
  );
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      summary: tool.presentation?.summary ?? '',
      status: wait ? 'degraded' : 'failed',
      blocks: [
        ...(tool.presentation?.blocks ?? []),
        ...(!tool.presentation?.blocks.some((b) => b.severity === 'error') && error
          ? [
              {
                id: 'operation-error',
                type: 'text' as const,
                severity: 'error' as const,
                text: error,
              },
            ]
          : []),
      ],
    },
  };
}
