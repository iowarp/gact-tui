import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  getToolPresentation,
  getToolSummary,
  getToolActivityTitle,
  humanizeToolName,
  getToolActionLabel,
  getToolSubject,
  getToolResultBlocks,
} from './tool-presentation';

describe('declared tool presentation', () => {
  it.each([
    'Observe tasks',
    'Restart agent',
    'Get task result',
    'Run flow',
    'Spawn agent task',
    'Inspect resources',
    'Refresh models',
  ])('preserves the catalog operation %s without a per-tool-name fallback', (title) => {
    const tool: ToolInvocation = {
      id: 't',
      session_id: 's',
      name: 'arbitrary_provider_tool',
      title,
      state: 'succeeded',
      presentation: { action: 'Inspect', summary: 'Tasks', blocks: [] },
    };
    expect(getToolActionLabel(tool)).toBe(title);
    expect(getToolSummary(tool)).toBeUndefined();
  });
  it.each(['Restart agent', 'Run flow', 'Spawn agent task'])(
    'omits the legacy task category filler for %s without guessing an outcome',
    (title) => {
      const tool: ToolInvocation = {
        id: 't',
        session_id: 's',
        name: 'opaque_tool',
        title,
        state: 'succeeded',
        presentation: {
          action: 'Inspect',
          summary: 'Tasks',
          blocks: [{ id: 'task-0-status', type: 'text', text: 'running' }],
        },
      };
      expect(getToolSummary(tool)).toBeUndefined();
      expect(getToolResultBlocks(tool)[0].text).toBe('running');
    },
  );
  it('gives one declared result identity one heading while preserving result bodies and raw labels', () => {
    const tool: ToolInvocation = {
      id: 't',
      session_id: 's',
      name: 'opaque_tool',
      title: 'Observe tasks',
      state: 'succeeded',
      presentation: {
        action: 'Inspect',
        summary: 'Tasks',
        blocks: [
          { id: 'owner', type: 'link', target: 'session', uri: 'child1', label: 'Deep Researcher' },
          {
            id: 'assignment',
            type: 'text',
            label: 'Deep Researcher',
            text: 'Investigate the storage decision.',
          },
          {
            id: 'status',
            type: 'text',
            label: 'Deep Researcher',
            text: 'failed',
            severity: 'error',
          },
        ],
      },
    };
    expect(getToolSubject(tool)?.id).toBe('owner');
    expect(getToolSummary(tool)).toBeUndefined();
    const blocks = getToolResultBlocks(tool, 'owner');
    expect(blocks.map((block) => block.label)).toEqual([undefined, undefined]);
    expect(blocks.map((block) => block.text)).toEqual([
      'Investigate the storage decision.',
      'failed',
    ]);
    expect(blocks[1].severity).toBe('error');
    expect(tool.presentation?.blocks[1].label).toBe('Deep Researcher');
    expect(getToolResultBlocks(tool)[0].id).toBe('owner');
  });
  it('omits a plain label/value restatement of identity while retaining diagnostic fields and the raw record', () => {
    const tool: ToolInvocation = {
      id: 't',
      session_id: 's',
      name: 'opaque_tool',
      state: 'succeeded',
      presentation: {
        summary: '',
        subject: 'identity',
        blocks: [
          { id: 'identity', type: 'text', text: 'Dataset: climate' },
          { id: 'same-fact', type: 'text', label: 'Dataset', text: 'climate' },
          { id: 'warning', type: 'text', label: 'Dataset', text: 'climate', severity: 'warning' },
          { id: 'body', type: 'markdown', text: '# Dataset: climate\n\nActual document content.' },
        ],
      },
    };
    expect(getToolResultBlocks(tool, 'identity').map((block) => block.id)).toEqual([
      'warning',
      'body',
    ]);
    expect(tool.presentation?.blocks).toHaveLength(4);
    expect(getToolResultBlocks(tool, 'identity')[1].text).toContain('# Dataset: climate');
  });
  it('keeps saved output attachments in the result unless explicitly declared as the subject', () => {
    const tool: ToolInvocation = {
      id: 't',
      session_id: 's',
      name: 'opaque_tool',
      state: 'succeeded',
      presentation: {
        summary: '',
        blocks: [
          { id: 'output', type: 'link', target: 'file', uri: 'output.txt', label: 'Full output' },
        ],
      },
    };
    expect(getToolSubject(tool)).toBeUndefined();
    expect(getToolResultBlocks(tool)[0].id).toBe('output');
    expect(
      getToolSubject({ ...tool, presentation: { ...tool.presentation!, subject: 'output' } })?.id,
    ).toBe('output');
  });
  it('keeps distinct entities with the same name and never chooses a primary target from a batch', () => {
    const tool: ToolInvocation = {
      id: 't',
      session_id: 's',
      name: 'opaque_tool',
      state: 'succeeded',
      presentation: {
        summary: '2 results',
        blocks: [
          { id: 'first', type: 'link', target: 'session', uri: 'child1', label: 'Researcher' },
          { id: 'second', type: 'link', target: 'session', uri: 'child2', label: 'Researcher' },
        ],
      },
    };
    expect(getToolSubject(tool)).toBeUndefined();
    expect(getToolResultBlocks(tool).map((block) => block.uri)).toEqual(['child1', 'child2']);
    expect(getToolSummary(tool)).toBe('2 results');
  });
  it('identifies general, selected and batched widget catalog loads consistently', () => {
    const tool: ToolInvocation = {
      id: 'catalog',
      session_id: 'session',
      state: 'succeeded',
      name: 'load_skill',
      title: 'Load skill',
      input: { skill_id: 'a2ui-catalog-clio-workspace' },
      presentation: {
        summary: '',
        subject: 'skill',
        blocks: [{ id: 'skill', type: 'text', text: 'a2ui-catalog-clio-workspace' }],
      },
    };
    expect(getToolActivityTitle(tool)).toBe('Inspect widget catalog (General)');
    expect(
      getToolActivityTitle({
        ...tool,
        input: { skill_id: 'a2ui-catalog-clio-workspace', file: 'catalog.json#/components/Image' },
      }),
    ).toBe('Inspect widget catalog (Image)');
    expect(
      getToolActivityTitle({
        ...tool,
        input: {
          kwargs: {
            skill_id: 'a2ui-catalog-clio-workspace',
            file: 'catalog.json#/components/Image',
          },
        },
      }),
    ).toBe('Inspect widget catalog (Image)');
    expect(
      getToolActivityTitle({
        ...tool,
        input: {
          skill_id: 'a2ui-catalog-clio-workspace',
          files: [
            'catalog.json#/components/Image',
            'catalog.json#/components/Text',
            'catalog.json#/components/Image',
          ],
        },
      }),
    ).toBe('Inspect widget catalog (Image, Text)');
    expect(
      getToolPresentation({ ...tool, name: 'create_a2ui_surface', title: 'Generate UI element' })
        .title,
    ).toBe('Generate widget');
    expect(
      getToolPresentation({
        ...tool,
        name: 'prepare_execution_runtime',
        title: 'Prepare execution runtime',
      }).title,
    ).toBe('Get execution environment');
  });
  it.each(['fs_read_file', 'create_a2ui_surface', 'shell_bash', 'third_party_tool'])(
    'uses provider labels consistently for %s',
    (name) => {
      const tool: ToolInvocation = {
        id: 'call',
        session_id: 'session',
        state: 'succeeded',
        name,
        title: 'Provider label',
        presentation: { summary: 'Provider summary', blocks: [] },
      };
      expect(getToolPresentation(tool)).toEqual({ title: 'Provider label', kind: 'tool' });
      expect(getToolSummary(tool)).toBe('Provider summary');
      expect(getToolPresentation({ ...tool, title: undefined }).title).toBe(name);
      expect(humanizeToolName(name)).toBe(name);
    },
  );
  it.each(['message', 'path', 'stdout', 'summary', 'status'])(
    'does not infer transcript prose from raw %s',
    (key) => {
      const tool: ToolInvocation = {
        id: 'call',
        session_id: 'session',
        state: 'succeeded',
        name: 'tool',
        output: { [key]: 'raw technical result' },
      };
      expect(getToolSummary(tool)).toBeUndefined();
    },
  );
});

it.each([
  ['run_flow', 'Start flow'],
  ['restart_agent', 'Restart agent'],
  ['observe_tasks', 'Check task status'],
  ['task_result', 'Read task result'],
  ['spawn_agent_task', 'Delegate to agent'],
])('corrects retained Inspect metadata for %s', (name, label) => {
  const tool: ToolInvocation = {
    id: 'old',
    session_id: 's',
    name,
    title: 'Inspect',
    state: 'succeeded',
    presentation: { action: 'Inspect', summary: 'Tasks', blocks: [] },
  };
  expect(getToolActionLabel(tool)).toBe(label);
  expect(getToolSummary(tool)).toBeUndefined();
});
it('reports a retained restart request as a request', () => {
  expect(
    getToolSummary({
      id: 'r',
      session_id: 's',
      name: 'restart_agent',
      state: 'succeeded',
      output: [{ type: 'text', text: '{"restart_requested":true,"pending":true}' }],
    }),
  ).toBe('Restart requested');
});

it('labels an accepted start request independently of the later flow outcome', () => {
  expect(
    getToolSummary({
      id: 'r',
      session_id: 's',
      name: 'run_flow',
      state: 'succeeded',
      output: { accepted: true, handle: 'task' },
    }),
  ).toBe('Request accepted');
});

it('replaces a legacy Subagent placeholder with the recorded flow or assigned agent name', () => {
  const base: ToolInvocation = {
    id: 'old',
    session_id: 's',
    name: 'run_flow',
    state: 'succeeded',
    input: { flow: 'deep-research' },
    presentation: {
      summary:'',
      subject: 'target',
      blocks: [{ id: 'target', type: 'link', target: 'session', uri: 'child', label: 'Subagent' }],
    },
  };
  expect(getToolSubject(base)?.label).toBe('Deep research');
  expect(
    getToolSubject({ ...base, name: 'spawn_agent_task', input: { name: 'Report recovery' } })
      ?.label,
  ).toBe('Report recovery');
  expect(getToolActionLabel({ ...base, name: 'get_task_result', title: 'Inspect' })).toBe(
    'Read task result',
  );
});
