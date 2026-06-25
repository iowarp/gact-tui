/**
 * Pure helpers that summarise a message's tool-call parts (display name,
 * status, duration, input/output) for the Inspector tool-calls tab.
 */
import type { Message, Part } from '@clio/core';
import { isRecord } from '../presentationUtils.js';

export interface ToolCallSummary {
  callId: string;
  toolName: string;
  status: 'started' | 'completed' | 'error';
  durationMs?: number;
  input?: unknown;
  output?: unknown;
}

/**
 * Display name for a tool — the tool name verbatim, humanised (snake/kebab →
 * Title Case). GACT never special-cases a specific tool's name (contract/SPEC.md:
 * "Unknown names MUST render as a generic row without special handling").
 */
export function toolDisplayName(toolName: string): string {
  const normalized = toolName.trim();
  if (!normalized) return normalized;
  return normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

export function toolCallInput(summary: ToolCallSummary, parts: readonly Part[]): string | null {
  const part = parts.find(
    (item) =>
      item.type === 'tool_call' && (item.call_id === summary.callId || item.id === summary.callId),
  );
  if (part?.type === 'tool_call' && part.input) {
    return JSON.stringify(part.input, null, 2);
  }
  if (summary.input != null) {
    return JSON.stringify(summary.input, null, 2);
  }
  return null;
}

export function toolCallOutput(summary: ToolCallSummary, parts: readonly Part[]): string | null {
  const part = parts.find(
    (item) =>
      item.type === 'tool_result' &&
      (item.call_id === summary.callId || item.tool_call_id === summary.callId),
  );
  if (part?.type === 'tool_result') {
    if (typeof part.output === 'string') return part.output;
    if (Array.isArray(part.content)) {
      return part.content
        .map((content) => (content.type === 'text' ? content.text : `[${content.type}]`))
        .join('\n');
    }
  }
  if (summary.output != null) {
    return typeof summary.output === 'string'
      ? summary.output
      : JSON.stringify(summary.output, null, 2);
  }
  return null;
}

export function summarizeToolCalls(source: Message | Part[]): ToolCallSummary[] {
  const parts = Array.isArray(source) ? source : source.parts;
  const metadata = Array.isArray(source) ? undefined : source.metadata;
  const out: ToolCallSummary[] = [];
  for (const part of parts) {
    if (part.type === 'tool_call') {
      out.push({
        callId: part.call_id ?? part.id ?? 'unknown',
        toolName: part.tool_name,
        status: 'started',
      });
    }
    if (part.type === 'tool_result') {
      const target = out.find((tool) => tool.callId === (part.call_id ?? part.tool_call_id));
      if (target) {
        target.status = part.is_error ? 'error' : 'completed';
        if (part.duration_ms != null) target.durationMs = part.duration_ms;
      }
    }
  }
  const metaCalls = Array.isArray(metadata?.['tools_called']) ? metadata?.['tools_called'] : [];
  const metadataFingerprints = new Map<string, ToolCallSummary>();
  for (const raw of metaCalls) {
    if (!isRecord(raw)) continue;
    const name = String(raw['name'] ?? raw['tool'] ?? raw['tool_name'] ?? '');
    if (!name) continue;
    const input = raw['args'];
    const output = raw['result'];
    const fingerprint = metadataToolFingerprint(name, input, output);
    const existing = metadataFingerprints.get(fingerprint);
    const rawCallId = raw['call_id'];
    const callId = String(rawCallId ?? `${name}-${out.length}`);
    if (out.some((row) => row.callId === callId)) continue;
    const ok = raw['ok'];
    const status: ToolCallSummary['status'] = ok === false || raw['error'] ? 'error' : 'completed';
    const durationRaw = raw['duration_ms'];
    const durationMs = typeof durationRaw === 'number' ? Math.round(durationRaw) : undefined;
    if (existing) {
      if (status === 'error') existing.status = 'error';
      if (durationMs != null) existing.durationMs = durationMs;
      if (rawCallId != null && existing.callId.startsWith(`${name}-`)) {
        existing.callId = callId;
      }
      continue;
    }
    const summary: ToolCallSummary = {
      callId,
      toolName: name,
      status,
      ...(durationMs != null ? { durationMs } : {}),
      ...(input != null ? { input } : {}),
      ...(output != null ? { output } : {}),
    };
    metadataFingerprints.set(fingerprint, summary);
    out.push(summary);
  }
  return out;
}

function stableJson(value: unknown): string {
  if (!isRecord(value) && !Array.isArray(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`;
}

function metadataToolFingerprint(name: string, input: unknown, output: unknown): string {
  return `${name}\n${stableJson(input)}\n${stableJson(output)}`;
}
