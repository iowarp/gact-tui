import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@clio/core';
import {
  summarizeToolCalls,
  toolCallInput,
  toolCallOutput,
  toolDisplayName,
  type ToolCallSummary,
} from '../../src/components/InspectorToolCallsModel.js';

describe('InspectorToolCallsModel', () => {
  it('humanises any tool name verbatim (no per-tool special-casing)', () => {
    expect(toolDisplayName('fs_read_file')).toBe('Fs Read File');
    expect(toolDisplayName('custom-tool_name')).toBe('Custom Tool Name');
  });

  it('extracts call input and output from matching parts before summary fallback', () => {
    const summary: ToolCallSummary = {
      callId: 'call_1',
      toolName: 'shell_bash',
      status: 'completed',
      input: { stale: true },
      output: 'stale',
    };
    const parts: Part[] = [
      { type: 'tool_call', call_id: 'call_1', tool_name: 'shell_bash', input: { cmd: 'date' } },
      { type: 'tool_result', call_id: 'call_1', output: 'Sat Jun 20' },
    ] as Part[];

    expect(toolCallInput(summary, parts)).toBe(JSON.stringify({ cmd: 'date' }, null, 2));
    expect(toolCallOutput(summary, parts)).toBe('Sat Jun 20');
  });

  it('serializes fallback summary details when parts are unavailable', () => {
    const summary: ToolCallSummary = {
      callId: 'meta_1',
      toolName: 'ndp_search_datasets',
      status: 'completed',
      input: { search: 'earthscope' },
      output: { rows: 1 },
    };

    expect(toolCallInput(summary, [])).toBe(JSON.stringify({ search: 'earthscope' }, null, 2));
    expect(toolCallOutput(summary, [])).toBe(JSON.stringify({ rows: 1 }, null, 2));
  });

  it('summarizes part-based tool calls and metadata-only calls', () => {
    const message: Message = {
      id: 'msg',
      role: 'assistant',
      parts: [
        { type: 'tool_call', call_id: 'call_1', tool_name: 'shell_bash', input: { cmd: 'date' } },
        { type: 'tool_result', call_id: 'call_1', output: 'ok', duration_ms: 5 },
      ],
      metadata: {
        tools_called: [
          {
            call_id: 'meta_1',
            name: 'ndp_search_datasets',
            args: { search: 'earthscope' },
            result: '{"rows":1}',
            duration_ms: 8.5,
            ok: true,
          },
        ],
      },
    } as Message;

    expect(summarizeToolCalls(message)).toEqual([
      {
        callId: 'call_1',
        toolName: 'shell_bash',
        status: 'completed',
        durationMs: 5,
      },
      {
        callId: 'meta_1',
        toolName: 'ndp_search_datasets',
        status: 'completed',
        durationMs: 9,
        input: { search: 'earthscope' },
        output: '{"rows":1}',
      },
    ]);
  });
});
