import type { Message, MessageBlock, ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { conversationTurnPresentation } from './conversation-turn-model';

const tools: Record<string, ToolInvocation> = {
  call_read: { id: 'call_read', session_id: 'session_1', name: 'fs_read_file', state: 'succeeded' },
  call_run: { id: 'call_run', session_id: 'session_1', name: 'shell_bash', state: 'failed' },
};

function message(blocks: MessageBlock[]): Message {
  return {
    id: 'message_1',
    session_id: 'session_1',
    role: 'assistant',
    created_at: '2026-10-09T00:00:00Z',
    blocks,
  };
}

describe('tool-scoped harness additions', () => {
  it('keeps canonical sequence and original content without splitting the activity lane', () => {
    const spill: MessageBlock = {
      id: 'spill',
      type: 'injection',
      source: 'result_spilled',
      call_id: 'call_read',
      text: '[clio: result_spilled] The complete result is in `tool-output/result.json`.',
      sequence: 2,
    };
    const view = conversationTurnPresentation(
      message([
        { id: 'run', type: 'tool', tool_id: 'call_run', sequence: 3 },
        spill,
        { id: 'read', type: 'tool', tool_id: 'call_read', sequence: 1 },
        { id: 'answer', type: 'text', channel: 'answer', text: 'Available.', sequence: 4 },
      ]),
      tools,
    );

    expect(view.iterations).toHaveLength(1);
    expect(view.iterations[0]?.activity.map((entry) => entry.id)).toEqual([
      'call_read',
      'spill',
      'call_run',
    ]);
    const note = view.iterations[0]?.activity[1];
    expect(note?.kind === 'injection' && note.block).toBe(spill);
    expect(view.iterations[0]?.tools.map((tool) => tool.state)).toEqual(['succeeded', 'failed']);
    expect(view.residualBlocks.map((block) => block.id)).toEqual(['answer']);
    expect(view.segments.map((segment) => segment.kind)).toEqual(['iterations', 'block']);
  });

  it.each(['path_hint', 'circuit_breaker', 'hook', 'future_tool_note'])(
    'uses the call link for %s even before the tool record arrives',
    (source) => {
      const view = conversationTurnPresentation(
        message([
          {
            id: 'note',
            type: 'injection',
            source,
            call_id: 'pending_call',
            text: 'Exact feedback.',
          },
        ]),
        {},
      );
      expect(view.iterations[0]?.activity.map((entry) => entry.kind)).toEqual(['injection']);
      expect(view.iterations[0]?.tools).toEqual([]);
      expect(view.residualBlocks).toEqual([]);
    },
  );

  it('preserves turn context, compaction boundaries and variant ownership', () => {
    const view = conversationTurnPresentation(
      message([
        { id: 'reminder', type: 'injection', source: 'plan_mode', text: 'Read first.' },
        { id: 'read', type: 'tool', tool_id: 'call_read' },
        {
          id: 'note',
          type: 'injection',
          source: 'path_hint',
          call_id: 'call_read',
          text: 'Try data/a.csv.',
        },
        {
          id: 'summary',
          type: 'injection',
          source: 'summarization',
          call_id: 'call_read',
          text: 'Earlier work.',
        },
        { id: 'run', type: 'tool', tool_id: 'call_run' },
        {
          id: 'variant',
          type: 'injection',
          source: 'path_hint',
          call_id: 'call_run',
          text: 'Draft only.',
          variants_id: 'variants_1',
        },
        {
          id: 'transport',
          type: 'injection',
          source: 'tool_use',
          call_id: 'call_run',
          text: 'Tool protocol.',
        },
      ]),
      tools,
    );
    expect(view.iterations.map((iteration) => iteration.activity.map((entry) => entry.id))).toEqual(
      [['call_read', 'note'], ['call_run']],
    );
    expect(view.compactionRecords.map((record) => record.block.id)).toEqual(['summary']);
    expect(
      view.segments.map((segment) => (segment.kind === 'block' ? segment.block.id : 'activity')),
    ).toEqual(['reminder', 'activity', 'summary', 'activity']);
  });
});
