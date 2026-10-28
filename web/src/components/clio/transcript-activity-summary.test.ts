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
    failed: 0,
  });
  expect(transcriptActivitySummary([iteration([read, { ...wait, state: 'succeeded' }])])).toEqual({
    label: 'Read files, used tools',
    running: false,
    failed: 0,
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
    failed: 1,
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
    failed: 0,
  });
  expect(transcriptActivitySummary([iteration([], { interrupted: true })])).toEqual({
    label: 'Activity (Interrupted)',
    running: false,
    failed: 0,
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

it('names a shell result notification and the parallel-calls hint by what they are', () => {
  // The service sends one task's result as task_result and the parallel-calls hint as tool_use.
  const run = { id: 'run', session_id: 's', name: 'shell_bash', state: 'succeeded' as const };
  expect(
    transcriptActivitySummary([
      iteration([run], {
        activity: [
          {
            kind: 'injection',
            id: 'hint',
            block: { id: 'hint', type: 'injection', source: 'tool_use', text: 'Hint' },
          },
          { kind: 'tool', id: run.id, tool: run },
          {
            kind: 'injection',
            id: 'result',
            block: { id: 'result', type: 'injection', source: 'task_result', text: 'Result' },
          },
        ],
      }),
    ]).label,
  ).toBe('Received reminder, ran commands, received results');
});

it('identifies streamed reasoning after a read has finished without claiming the read is running', () => {
  const read = { id: 'read', session_id: 's', name: 'fs_read_file', state: 'succeeded' as const };
  expect(
    transcriptActivitySummary([
      iteration([read], {
        streaming: true,
        thinking: [
          {
            id: 'reasoning',
            text: 'Actual provider reasoning',
            label: 'Thinking',
            streaming: true,
          },
        ],
      }),
    ]),
  ).toEqual({ label: 'Thinking', running: true, failed: 0 });
  expect(
    transcriptActivitySummary([
      iteration([read, { ...read, id: 'search', name: 'web_search', state: 'running' }], {
        streaming: true,
      }),
    ]),
  ).toEqual({ label: 'Read files, running searches', running: true, failed: 0 });
});

it('names memory work so a folded turn shows that memory changed', () => {
  const tool = (id: string, name: string): ToolInvocation => ({
    id,
    session_id: 's',
    name,
    state: 'succeeded',
  });
  expect(
    transcriptActivitySummary([iteration([tool('a', 'memory_search'), tool('b', 'create_memory')])])
      .label,
  ).toBe('Checked memory, updated memory');
  expect(transcriptActivitySummary([iteration([tool('c', 'forget_memory')])]).label).toBe(
    'Forgot from memory',
  );
  const held: ToolInvocation = {
    ...tool('d', 'create_memory'),
    output: { tool: 'create_memory', memory: { action: 'already_remembered' } },
  };
  expect(transcriptActivitySummary([iteration([held])]).label).toBe('Checked memory');
});

it('does not say files were edited when the write was refused', () => {
  const refused = { id: 'w', session_id: 's', name: 'fs_write_file', state: 'failed' as const };
  const written = { ...refused, id: 'w2', state: 'succeeded' as const };
  expect(transcriptActivitySummary([iteration([refused])]).label).toBe('Tried to edit files');
  expect(transcriptActivitySummary([iteration([written])]).label).toBe('Edited files');
});
