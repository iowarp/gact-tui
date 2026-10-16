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

it('shows the active question wait above prior operations until it settles', () => {
  const read: ToolInvocation = {
    id: 'read',
    session_id: 's',
    name: 'fs_read_file',
    state: 'succeeded',
  };
  const wait: ToolInvocation = {
    id: 'wait',
    session_id: 's',
    name: 'wait_tasks',
    state: 'running',
    presentation: { summary: 'Waiting for your answer', blocks: [] },
  };
  expect(transcriptActivitySummary([iteration([read, wait], { streaming: true })])).toEqual({
    label: 'Waiting for your answer',
    running: true,
  });
  expect(transcriptActivitySummary([iteration([read, { ...wait, state: 'succeeded' }])])).toEqual({
    label: 'Read files, used tools',
    running: false,
  });
});

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

it('includes received results and reminders in the same ordered action summary', () => {
  const run = { id: 'run', session_id: 's', name: 'exec_command', state: 'succeeded' as const };
  expect(
    transcriptActivitySummary([
      iteration([run], {
        activity: [
          {
            kind: 'injection',
            id: 'results',
            block: { id: 'results', type: 'injection', source: 'task_results', text: 'Result' },
          },
          { kind: 'tool', id: run.id, tool: run },
          {
            kind: 'injection',
            id: 'reminder',
            block: { id: 'reminder', type: 'injection', source: 'plan_mode', text: 'Reminder' },
          },
        ],
      }),
    ]).label,
  ).toBe('Received results, ran commands, received reminder');
});
