/**
 * Pure helpers for the transcript tool-call part view (labels, status, and
 * argument/result formatting).
 */
import type { FileDiff, Message, PartText, PartToolResult } from '@clio/core';
import { isRecord } from './WorkflowStateModel.js';

export function toolResultBody(part: PartToolResult): string {
  if (typeof part.output === 'string') return part.output;
  if (Array.isArray(part.content)) {
    return part.content
      .map((c) => {
        if (c.type === 'text') return c.text;
        if (c.type === 'tool_result') return typeof c.output === 'string' ? c.output : '';
        return `[${c.type}]`;
      })
      .join('\n');
  }
  return '';
}

export function commandResultInfo(
  part: PartText,
  text: string,
): { command: string; text: string } | null {
  const synthetic = String(part.metadata?.['synthetic'] ?? '');
  if (synthetic !== 'command_result') return null;
  const command = String(part.metadata?.['command'] ?? '').trim() || 'Command';
  const prefix = command.startsWith('/') ? `[${command}]` : '';
  const body = prefix && text.trimStart().startsWith(prefix)
    ? text.trimStart().slice(prefix.length).trimStart()
    : text;
  return { command, text: body };
}

export function metadataToolDiffs(msg: Message): FileDiff[] {
  if (msg.parts.some((part) => part.type === 'file_diff')) return [];
  const metadata = msg.metadata;
  const tools = Array.isArray(metadata?.['tools_called'])
    ? metadata['tools_called']
    : [];
  const diffs: FileDiff[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!isRecord(tool)) continue;
    const name = String(tool['name'] ?? tool['tool_name'] ?? '');
    if (name !== 'fs_propose_edit') continue;
    const result = parseToolResult(tool['result']);
    if (!isRecord(result)) continue;
    const path = String(result['path'] ?? result['filepath'] ?? toolPath(tool) ?? '');
    const unifiedDiff = typeof result['unified_diff'] === 'string'
      ? result['unified_diff']
      : '';
    if (!path || !unifiedDiff) continue;
    const key = `${path}\n${unifiedDiff}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diffs.push({
      id: `metadata-diff-${msg.id}-${diffs.length}`,
      type: 'file_diff',
      path,
      unified_diff: unifiedDiff,
      after: typeof result['new_content'] === 'string' ? result['new_content'] : undefined,
    });
  }
  return diffs;
}

function parseToolResult(value: unknown): unknown {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function toolPath(tool: Record<string, unknown>): string {
  const args = tool['args'];
  if (!isRecord(args)) return '';
  return String(args['filepath'] ?? args['path'] ?? '');
}
