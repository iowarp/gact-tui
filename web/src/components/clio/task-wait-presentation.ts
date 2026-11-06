import type { ToolInvocation } from '@clio/core/v3';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function waitResult(output: unknown): Record<string, unknown> | undefined {
  // Earlier native results were retained as one JSON text part.
  if (Array.isArray(output) && output.length === 1) output = record(output[0])?.text;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return undefined;
    }
  }
  const outer = record(output);
  const result = record(outer?.structuredContent) ?? record(outer?.structured_content) ?? outer;
  return Array.isArray(result?.pending) &&
    (Array.isArray(result.outcomes) || Array.isArray(result.results))
    ? result
    : undefined;
}

/** Identify interrupted waits from explicit receipts or the exact legacy recorder marker. */
export function taskWaitInterruptionDetail(tool: ToolInvocation): string | undefined {
  if (tool.name !== 'wait_tasks') return undefined;
  if (tool.presentation?.status === 'interrupted' && tool.presentation.diagnostic?.trim())
    return tool.presentation.diagnostic.trim();
  const cancelled = 'tool call completed after session cancellation';
  if (
    tool.presentation?.blocks.some(
      (block) =>
        block.id === 'execution-error' &&
        block.severity === 'error' &&
        block.text?.trim() &&
        block.text !== cancelled,
    )
  )
    return undefined;
  if (tool.state === 'failed' && tool.error && !['Tool failed', cancelled].includes(tool.error))
    return undefined;
  const result = waitResult(tool.output);
  if (result?.interrupted === 'mail_received') return 'Interrupted by mail';
  if (result?.interrupted === 'stopped') return 'Interrupted by a stop request';
  if (typeof result?.interrupted === 'string' && result.interrupted.trim()) return 'Interrupted';
  // This exact recorder marker was emitted only when no independent tool
  // error existed. It does not identify who cancelled the owning session.
  const raw =
    Array.isArray(tool.output) && tool.output.length === 1
      ? record(tool.output[0])?.text
      : tool.output;
  if (
    ['failed', 'cancelled'].includes(tool.state) &&
    (raw === cancelled ||
      tool.error === cancelled ||
      tool.presentation?.blocks.some(
        (block) => block.id === 'execution-error' && block.text === cancelled,
      ))
  )
    return 'Interrupted by session cancellation';
  if (tool.state === 'cancelled') return 'Interrupted';
  return undefined;
}

/** Project known interruption receipts while preserving the original payload. */
export function withTaskWaitInterruption(tool: ToolInvocation): ToolInvocation {
  const diagnostic = taskWaitInterruptionDetail(tool);
  if (!diagnostic) return tool;
  return {
    ...tool,
    presentation: {
      ...tool.presentation,
      summary: tool.presentation?.summary ?? '',
      status: 'interrupted',
      diagnostic,
      blocks: (tool.presentation?.blocks ?? []).filter(
        (block) =>
          !(
            block.id === 'execution-error' &&
            block.text === 'tool call completed after session cancellation'
          ),
      ),
    },
  };
}
