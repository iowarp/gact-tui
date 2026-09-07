import type { ToolInvocation } from '@clio/core/v3';

export interface ToolDiff {
  path: string;
  unifiedDiff: string;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Return the authoritative structured result from an MCP envelope, or a direct result. */
export function presentationRecord(output: unknown): Record<string, unknown> | undefined {
  const envelope = asRecord(output);
  if (!envelope) return undefined;
  return asRecord(envelope.structuredContent) ?? asRecord(envelope.structured_content) ?? envelope;
}

export function outputDiff(output: unknown): ToolDiff | undefined {
  const record = presentationRecord(output);
  const path = record?.path;
  const unifiedDiff = record?.unified_diff;
  return typeof path === 'string' && path && typeof unifiedDiff === 'string' && unifiedDiff
    ? { path, unifiedDiff }
    : undefined;
}

export function toolOutputDiffKey(tool: ToolInvocation | undefined): string | undefined {
  const diff = outputDiff(tool?.output);
  return diff ? `${diff.path}\u0000${diff.unifiedDiff}` : undefined;
}

export function textBlocks(output: unknown): string[] {
  const envelope = asRecord(output);
  const blocks = Array.isArray(output)
    ? output
    : Array.isArray(envelope?.content)
      ? envelope.content
      : [];
  return blocks.flatMap((block) => {
    const record = asRecord(block);
    return record?.type === 'text' && typeof record.text === 'string' && record.text
      ? [record.text]
      : [];
  });
}

export function terminalOutput(
  tool: ToolInvocation,
  output: Record<string, unknown> | undefined,
): string | undefined {
  const hasFinalStreams = typeof output?.stdout === 'string' || typeof output?.stderr === 'string';
  if (!hasFinalStreams && !tool.output_stream) return undefined;
  const stdout = typeof output?.stdout === 'string' ? output.stdout : '';
  const stderr = typeof output?.stderr === 'string' ? output.stderr : '';
  const completedOutput = `${stdout}${stderr ? `\u001b[31m${stderr}\u001b[0m` : ''}`;
  return completedOutput || tool.output_stream || '';
}

/** Return the exact command recorded in a terminal tool's input. */
export function terminalCommand(tool: ToolInvocation): string | undefined {
  const command = asRecord(tool.input)?.command;
  return typeof command === 'string' && command.trim() ? command : undefined;
}

export function hasToolResultPresentation(tool: ToolInvocation): boolean {
  const output = presentationRecord(tool.output);
  const message = typeof output?.message === 'string' && Boolean(output.message.trim());
  const progressMessage = Boolean(tool.progress_message?.trim());
  const terminal = terminalOutput(tool, output) !== undefined;
  return (
    message ||
    progressMessage ||
    terminal ||
    Boolean(outputDiff(tool.output)) ||
    textBlocks(tool.output).length > 0
  );
}
