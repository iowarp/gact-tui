import { describe, expect, it } from 'vitest';
import type { ToolInvocation } from '@clio/core/v3';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import { toolOperation } from './tool-operation';
import { operationAnswer } from './tool-operation-data';

const call = (name: string, input?: unknown, output?: unknown): ToolInvocation => ({
  id: 'call',
  session_id: 'parent',
  name,
  state: 'succeeded',
  input,
  output,
});
const context = {
  subagents: {
    a: {
      id: 'a',
      session_id: 'parent',
      child_session_id: 'session-a',
      title: 'Build package',
      state: 'completed' as const,
    },
    b: {
      id: 'b',
      session_id: 'parent',
      child_session_id: 'session-b',
      title: 'Independent audit',
      state: 'running' as const,
    },
  },
};

describe('semantic operation contract', () => {
  it('covers every supported operation without retaining obsolete aliases', () => {
    expect(Object.keys(TOOL_OPERATIONS)).toHaveLength(84);
    for (const name of [
      'wait_agent_tasks',
      'observe_agent_tasks',
      'get_agent_task_output',
      'message_agent',
    ])
      expect(TOOL_OPERATIONS).not.toHaveProperty(name);
  });
  it.each(Object.keys(TOOL_OPERATIONS))('projects %s without changing its record', (name) => {
    const tool = call(name, {}, undefined);
    const original = structuredClone(tool);
    const operation = toolOperation(tool);
    expect(operation.action).toBeTruthy();
    expect(operation.action).not.toMatch(/[·—]/u);
    expect(tool).toEqual(original);
  });
  it('keeps a wait closed until a result or error returns', () => {
    const operation = toolOperation(
      call('wait_tasks', { tasks: ['a', 'b'] }, { outcomes: [], pending: ['a', 'b'] }),
      context,
    );
    expect(operation.expandable).toBe(false);
    expect(operation.metadata).toBe('0 returned, 2 running');
    expect(operation.subjects.map((s) => s.label)).toEqual(['Build package', 'Independent audit']);
  });
  it('renders recorded results rather than a newer child state or a summary of the result', () => {
    const operation = toolOperation(
      call(
        'wait_tasks',
        { tasks: ['a', 'b'] },
        {
          outcomes: [
            {
              handle: 'a',
              status: 'completed',
              result: { answer: '# Actual report\n\nEvidence and findings.' },
            },
          ],
          pending: ['b'],
        },
      ),
      context,
    );
    expect(operation.tasks?.map((t) => t.value)).toEqual([
      '# Actual report\n\nEvidence and findings.',
    ]);
    expect(operation.tasks?.[0].subject).toMatchObject({
      label: 'Build package',
      uri: 'session-a',
    });
    expect(operation.metadata).toBe('1 returned, 1 running');
  });
  it('preserves collection errors as returned content', () => {
    const operation = toolOperation(
      call(
        'wait_tasks',
        { tasks: ['a'] },
        { outcomes: [{ handle: 'a', error: 'Result expired' }], pending: [] },
      ),
      context,
    );
    expect(operation.expandable).toBe(true);
    expect(operation.tasks?.[0].error).toBe('Result expired');
  });
  it.each([null, false, 0, ''])('preserves an explicit scalar answer %j in a wait', (result) => {
    const operation = toolOperation(
      call('wait_tasks', { tasks: ['a'] }, { outcomes: [{ handle: 'a', result }], pending: [] }),
    );
    expect(operation.metadata).toBe('1 returned');
    expect(operation.tasks?.[0].value).toBe(result);
  });
  it('retains collection errors without a handle and never reports a negative returned count', () => {
    const operation = toolOperation(
      call(
        'wait_tasks',
        { tasks: ['a'] },
        { outcomes: [], pending: [], errors: [{ error: 'Result store unavailable' }] },
      ),
    );
    expect(operation.metadata).toBe('0 returned, 1 unavailable');
    expect(operation.tasks?.[0]).toMatchObject({
      subject: { label: 'Collection error' },
      error: 'Result store unavailable',
    });
    expect(operation.expandable).toBe(true);
  });
  it('does not decode capped previews or arbitrary JSON-looking answer strings', () => {
    const value = { truncated: true, preview: '{"answer":"not complete' };
    expect(operationAnswer(value)).toBe(value);
    expect(operationAnswer('{"answer":"literal user text"}')).toBe(
      '{"answer":"literal user text"}',
    );
  });
  it('gives delegation its actual assignment, recorded model and named destination', () => {
    const operation = toolOperation(
      call(
        'spawn_agent_task',
        { agent: 'standard', name: 'Independent audit', task: 'Check all inputs.' },
        { handle: 'b', session_id: 'session-b', model: { ran: { model_id: 'model-1' } } },
      ),
      context,
    );
    expect(operation.tasks?.[0]).toMatchObject({
      assignment: 'Check all inputs.',
      agent: 'standard',
      model: 'model-1',
      subject: { label: 'Independent audit' },
    });
  });
  it('puts search selection in the title and actual hits in the body', () => {
    const matches = [{ title: 'Station calibration', text: 'S003 interval approved' }];
    const operation = toolOperation(
      call(
        'query_tasks',
        { query: 'calibration', scope: 'tree', status: 'completed' },
        { matches },
      ),
    );
    expect(operation.qualifier).toBe('for “calibration” (tree, completed)');
    expect(operation.value).toBe(matches);
    expect(operation.metadata).toBe('1 match');
  });
  it('uses literal provider data when an unrelated model presenter recorded no provider results', () => {
    const tool = call('list_models', {}, { models: [{ id: 'vision-1', vision: true }], count: 1 });
    tool.presentation = { summary: 'No provider results', blocks: [] };
    expect(toolOperation(tool).value).toEqual([{ id: 'vision-1', vision: true }]);
  });
  it('keeps ordinary acknowledgements unexpandable and genuine failures visible', () => {
    expect(toolOperation(call('pause_agent', { handle: 'a' }, { paused: true })).expandable).toBe(
      false,
    );
    const failed = {
      ...call('pause_agent', { handle: 'a' }),
      state: 'failed' as const,
      error: 'Agent already ended',
    };
    expect(toolOperation(failed).expandable).toBe(true);
  });
  it('does not make an accepted MCP submission look like a fetched result', () => {
    expect(
      toolOperation(
        call(
          'web_fetch',
          { target: 'https://example.test' },
          { accepted: true, status: 'running', handle: 'mcp' },
        ),
      ).expandable,
    ).toBe(false);
  });
  it('links the memory scope itself', () => {
    expect(
      toolOperation(
        call('create_memory', { subject: 'Colors', scope: 'account' }, { fact: { text: 'Blue' } }),
      ).scope,
    ).toMatchObject({ target: 'memory', uri: 'scope:user', label: 'Personal' });
  });
  it('preserves the pinned page envelope for lazy result continuation', () => {
    const page = {
      result_reference: { sha256: 'original' },
      fragments_require_concatenation: true,
      result: { preview: '{"answer":', truncated: true },
      offset: 0,
      next_offset: 10,
      next_cursor: 'pinned',
    };
    const operation = toolOperation(call('get_task_result', { handle: 'a' }, page), context);
    expect(operation.kind).toBe('results');
    expect(operation.tasks?.[0].page).toBe(page);
  });
  it('does not present an irrecoverably capped envelope as an answer', () => {
    const operation = toolOperation(
      call('get_task_result', { handle: 'a' }, { truncated: true, preview: '{"answer":"cut' }),
      context,
    );
    expect(operation.metadata).toBe('Partial result');
    expect(String(operation.value)).not.toContain('preview');
    expect(String(operation.value)).toContain('not retained');
  });
  it("reads a blocking spawn's returned reports as results, one per child", () => {
    const operation = toolOperation(
      call(
        'spawn_agents_parallel',
        { wait: true, spawns: [{ name: 'Build package', task: 'Build it' }] },
        {
          outcomes: [
            { handle: 'a', status: 'completed', result: { answer: 'Built.' } },
            { handle: 'b', status: 'completed', result: { answer: 'Audited.' } },
          ],
          pending: [],
        },
      ),
      context,
    );
    expect(operation.kind).toBe('results');
    expect(operation.tasks?.map((task) => [task.subject.label, task.value])).toEqual([
      ['Build package', 'Built.'],
      ['Independent audit', 'Audited.'],
    ]);
    expect(operation.metadata).toBe('2 returned');
  });
  it('keeps a read extent, such as an empty file, as row metadata', () => {
    const read = {
      ...call('fs_read_file', { path: 'empty.log' }),
      presentation: { summary: 'Empty file', blocks: [] },
    };
    expect(toolOperation(read).metadata).toBe('Empty file');
  });
  it('names a file call by its path argument', () => {
    const operation = toolOperation(call('fs_read_file', { path: 'D:\\notes\\plan.md' }));
    expect(operation.subjects.map((subject) => subject.label)).toEqual(['plan.md']);
  });
  it("keeps a producer's linked search hits instead of the generic search reader", () => {
    const searched: ToolInvocation = {
      ...call(
        'fs_search_text',
        { path: 'D:\\work', query: 'window' },
        {
          structuredContent: { mode: 'content', matches: [{ path: 'D:\\work\\a.py', line: 4 }] },
        },
      ),
      presentation: {
        summary: '1 matching lines',
        blocks: [
          { id: 'query', type: 'text', label: 'Search text', text: 'window' },
          {
            id: 'match-0',
            type: 'link',
            target: 'file',
            uri: 'D:\\work\\a.py',
            label: 'a.py:4',
            line: 4,
          },
        ],
      },
    };
    const operation = toolOperation(searched);
    expect(operation.kind).toBe('declared');
    expect(operation.query).toBe('window');
    expect(operation.qualifier).toBe('for “window”');
  });
  it('shows a failed call by its error, not as a literal null result', () => {
    const failed = { ...call('fs_read_file', { path: 'a.bin' }, null), state: 'failed' as const };
    expect(toolOperation({ ...failed, error: 'File is not text.' }).kind).toBe('declared');
  });
  it('names a script by its declared subject and says a background launch is not its result', () => {
    const script = (input: Record<string, unknown>): ToolInvocation => ({
      ...call('run_code', input, { handle: 'task_1', accepted: true }),
      presentation: {
        action: 'Run script',
        subject: 'target',
        summary: 'Started in the background',
        blocks: [
          { id: 'target', type: 'text', label: 'Watch job-81', text: 'Watch job-81' },
          { id: 'script', type: 'code', language: 'python', text: 'print(1)' },
        ],
      },
    });
    const background = toolOperation(script({ code: 'print(1)', background: true }));
    expect(background.action).toBe('Run script');
    expect(background.subjects.map((subject) => subject.label)).toEqual(['Watch job-81']);
    expect(background.metadata).toBe('in the background');
    expect(toolOperation(script({ code: 'print(1)' })).metadata).toBeUndefined();
  });
  it('preserves false, zero, null and an empty string as literal results', () => {
    for (const value of [false, 0, null, ''])
      expect(toolOperation(call('third_party', {}, value)).value).toBe(value);
  });
});
