import { expect, it } from 'vitest';
import type { ToolInvocation } from '@clio/core/v3';
import type { ConversationIteration } from './conversation-turn-model';
import { transcriptActivitySummary } from './transcript-activity-summary';

function iteration(
  tools: ToolInvocation[],
  overrides: Partial<ConversationIteration> = {},
): ConversationIteration {
  return {
    id: 'i',
    index: 0,
    agentId: 'main',
    thinking: [],
    nextThoughts: [],
    activity: tools.map((tool) => ({ kind: 'tool', id: tool.id, tool })),
    tools,
    tasks: [],
    terminal: false,
    interrupted: false,
    streaming: false,
    summary: '',
    ...overrides,
  };
}

it('labels recorded actions without repeating counts or outcomes above the answer', () => {
  const tools = [
    { id: 'read', session_id: 's', name: 'fs_read_file', state: 'succeeded' as const },
    { id: 'run', session_id: 's', name: 'shell_bash', state: 'failed' as const },
  ];
  const iterations = [iteration(tools), iteration([tools[0]])];
  expect(transcriptActivitySummary(iterations)).toEqual({
    label: 'Read files, ran commands',
    running: false,
  });
  expect(
    transcriptActivitySummary([
      iteration([
        {
          ...tools[0],
          id: 'denied',
          presentation: { status: 'denied', summary: 'Denied', blocks: [] },
        },
        { ...tools[0], id: 'cancelled', state: 'cancelled' },
        {
          ...tools[0],
          id: 'partial',
          presentation: { status: 'degraded', summary: 'Partial', blocks: [] },
        },
      ]),
    ]).label,
  ).toBe('Read files');
});

it('keeps streaming and interrupted action entries identifiable without a numeric summary', () => {
  const tools = [
    { id: 'run', session_id: 's', name: 'exec_command', state: 'running' as const },
    { id: 'edit', session_id: 's', name: 'apply_patch', state: 'running' as const },
  ];
  expect(transcriptActivitySummary([iteration(tools, { streaming: true })])).toEqual({
    label: 'Running commands, editing files',
    running: true,
  });
  expect(transcriptActivitySummary([iteration([], { interrupted: true })])).toEqual({
    label: 'Activity (Interrupted)',
    running: false,
  });
});
