import { expect, it } from 'vitest';
import type { ConversationIteration } from './conversation-turn-model';
import { transcriptActivitySummary } from './transcript-activity-summary';

it('counts invocation identities once and preserves failure rather than claiming all completed', () => {
  const tools = [
    { id: 'read', session_id: 's', name: 'fs_read_file', state: 'succeeded' as const },
    { id: 'run', session_id: 's', name: 'shell_bash', state: 'failed' as const },
  ];
  const iterations = [
    { tools, streaming: false },
    { tools: [tools[0]], streaming: false },
  ] as ConversationIteration[];
  expect(transcriptActivitySummary(iterations)).toEqual({
    label: '2 tools · 1 completed · 1 failed',
    detail: '1 read, ran 1 command',
    running: false,
    failed: true,
  });
  expect(
    transcriptActivitySummary([
      {
        tools: [
          { ...tools[0], id: 'denied', presentation: { status: 'denied', blocks: [] } },
          { ...tools[0], id: 'cancelled', state: 'cancelled' },
          { ...tools[0], id: 'partial', presentation: { status: 'degraded', blocks: [] } },
        ],
        streaming: false,
      },
    ] as ConversationIteration[]).label,
  ).toBe('3 tools · 0 completed · 1 denied · 1 cancelled · 1 partial');
});
