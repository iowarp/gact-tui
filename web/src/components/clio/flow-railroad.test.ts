import { flowRunSchema, type FlowRun } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  flowDiagrams,
  flowRunElapsed,
  NOT_SERIES_PARALLEL_NOTE,
} from '@/hooks/use-flow-presentation';
import { boxName, markRailroad } from './flow-railroad-marks';
import { seriesParallel } from './flow-diagram-source';
import { railroadDiagram } from './flow-railroad';
import { flowMembers, flowVerdict, workflowSteps } from './flow-run-presentation';

function workflow(
  steps: Array<Record<string, unknown>>,
  extra: Partial<Record<keyof FlowRun, unknown>> = {},
  view: Record<string, unknown> = {},
): FlowRun {
  return flowRunSchema.parse({
    flow: 'workflow',
    status: 'running',
    view: { kind: 'workflow', steps, ...view },
    ...extra,
  });
}

function diagramOf(run: FlowRun, nested = new Map<string, FlowRun>()) {
  const model = {
    steps: workflowSteps(run, 'clio/standard'),
    members: run.view ? [] : flowMembers(run, 'clio/standard'),
    verdict: flowVerdict(run),
  };
  return flowDiagrams(run, model, nested, 'clio/standard').diagram;
}

const pick = {
  kind: 'closing',
  label: 'judge',
  state: { value: 'completed', label: 'Completed', word: 'done', tone: 'done' },
  flow: 'arena',
  verdict: {},
} as const;

describe('seriesParallel', () => {
  it('finds sequences and parallel branches, reducing transitive dependencies', () => {
    expect(
      seriesParallel([
        { id: 'clean', after: [] },
        { id: 'north', after: ['clean'] },
        { id: 'south', after: ['clean'] },
        { id: 'note', after: ['north', 'south', 'clean'] },
      ]),
    ).toEqual({
      kind: 'seq',
      items: [
        { kind: 'step', id: 'clean' },
        {
          kind: 'par',
          items: [
            { kind: 'step', id: 'north' },
            { kind: 'step', id: 'south' },
          ],
        },
        { kind: 'step', id: 'note' },
      ],
    });
  });

  it('nests a branch that is itself a sequence', () => {
    const shape = seriesParallel([
      { id: 'a', after: [] },
      { id: 'b', after: ['a'] },
      { id: 'c', after: [] },
      { id: 'd', after: ['b', 'c'] },
    ]);
    expect(shape).toEqual({
      kind: 'seq',
      items: [
        {
          kind: 'par',
          items: [
            {
              kind: 'seq',
              items: [
                { kind: 'step', id: 'a' },
                { kind: 'step', id: 'b' },
              ],
            },
            { kind: 'step', id: 'c' },
          ],
        },
        { kind: 'step', id: 'd' },
      ],
    });
  });

  it('returns null for crossing dependencies and cycles', () => {
    expect(
      seriesParallel([
        { id: 'a', after: [] },
        { id: 'b', after: [] },
        { id: 'c', after: ['a', 'b'] },
        { id: 'd', after: ['b'] },
      ]),
    ).toBeNull();
    expect(
      seriesParallel([
        { id: 'a', after: ['b'] },
        { id: 'b', after: ['a'] },
      ]),
    ).toBeNull();
  });
});

describe('flow railroad', () => {
  it('writes a workflow as sequence and choice, its states in the marks, not the labels', () => {
    const run = workflow([
      { id: 'clean', target: 'clio/standard', status: 'completed', handle: 't1' },
      { id: 'north', target: 'clio/standard', after: ['clean'], status: 'running', handle: 't2' },
      { id: 'south', target: 'reviewer', after: ['clean'], status: 'pending' },
      { id: 'note', target: 'self', after: ['north', 'south'], status: 'pending' },
    ]);
    const diagram = diagramOf(run);
    expect(diagram?.kind).toBe('railroad');
    if (diagram?.kind !== 'railroad') return;
    expect(diagram.railroad.source).toBe(
      [
        'railroad-beta',
        '  workflow = sequence(terminal("clean"), choice(terminal("north"), ' +
          'terminal("south")), terminal("note"));',
      ].join('\n'),
    );
    expect(diagram.railroad.marks.map((mark) => mark.tone)).toEqual([
      'done',
      'running',
      'waiting',
      'waiting',
    ]);
    expect(diagram.railroad.marks[2]!.title).toBe('south: Waiting. Runs reviewer.');
    expect(diagram.railroad.marks.map((mark) => mark.key)).toEqual([
      'clean',
      'north',
      'south',
      'note',
    ]);
    expect(diagram.railroad.marks[1]!.pick).toMatchObject({ kind: 'step', step: { id: 'north' } });
    expect(diagram.railroad.parallels).toEqual([{ from: 1, to: 3, count: 2 }]);
  });

  it('draws a proposal as optional and a retried step as oneOrMore', () => {
    const run = workflow(
      [
        { id: 'draft', target: 'self', status: 'completed', handle: 't1' },
        {
          id: 'check',
          target: 'self',
          after: ['draft'],
          status: 'repaired',
          invocation: 'flowrun_1:agent:key=step:check:aa:0',
          handle: 't3',
        },
      ],
      {
        calls: [
          { invocation: 'flowrun_1:agent:key=step:check:aa:0', kind: 'agent', handle: 't2' },
          { invocation: 'flowrun_1:agent:key=step:check:bb:0', kind: 'agent', handle: 't3' },
        ],
      },
      {
        awaiting_approval: [{ id: 'polish', target: 'self', after: ['check'], by: 'critic' }],
        editors: ['critic'],
      },
    );
    const diagram = diagramOf(run);
    if (diagram?.kind !== 'railroad') throw new Error('expected a railroad');
    expect(diagram.railroad.source).toContain('oneOrMore(terminal("check"))');
    expect(diagram.railroad.source).toContain('optional(terminal("polish"))');
    expect(diagram.railroad.marks.find((mark) => mark.key === 'check')!.title).toBe(
      'check: Repaired, 2 attempts. Runs this agent.',
    );
    expect(diagram.railroad.marks.at(-1)!.tone).toBe('proposed');
  });

  it('draws the flow a step runs inline, boxed under the step name', () => {
    const run = workflow(
      [
        { id: 'gather', target: 'self', status: 'completed', handle: 't1' },
        {
          id: 'pick',
          target: 'arena',
          after: ['gather'],
          status: 'running',
          handle: 't_arena',
          invocation: 'flowrun_1:flow:key=step:pick:cc:0',
        },
      ],
      { calls: [{ invocation: 'flowrun_1:flow:key=step:pick:cc:0', kind: 'flow' }] },
    );
    const nested = flowRunSchema.parse({
      flow: 'arena',
      status: 'running',
      view: null,
      calls: [
        { invocation: 'a', kind: 'agent', target: 'self', handle: 'e0', status: 'completed' },
        { invocation: 'b', kind: 'agent', target: 'self', handle: 'e1', status: 'running' },
      ],
    });
    expect(diagramOf(run)).toMatchObject({
      railroad: {
        source: 'railroad-beta\n  workflow = sequence(terminal("gather"), nonterminal("pick"));',
      },
    });
    const diagram = diagramOf(run, new Map([['pick', nested]]));
    if (diagram?.kind !== 'railroad') throw new Error('expected a railroad');
    expect(diagram.railroad.source).toBe(
      '---\nconfig:\n  railroad:\n    verticalSeparation: 44\n---\n' +
        'railroad-beta\n  workflow = sequence(terminal("gather"), sequence(choice(terminal("entry 1"), ' +
        'terminal("entry 2")), terminal("judge")));',
    );
    expect(diagram.railroad.marks.map((mark) => [mark.key, mark.tone])).toEqual([
      ['gather', 'done'],
      ['pick/a', 'done'],
      ['pick/b', 'running'],
      ['pick/closing', 'waiting'],
    ]);
    expect(diagram.railroad.boxes).toEqual([
      expect.objectContaining({
        label: 'pick',
        from: 1,
        to: 4,
        mark: expect.objectContaining({ key: 'pick', tone: 'running' }),
      }),
    ]);
    expect(diagram.railroad.marks[3]!.pick).toMatchObject({ kind: 'closing', flow: 'arena' });
  });

  it('falls back to the graph with a visible reason when the workflow is not series-parallel', () => {
    const run = workflow([
      { id: 'a', status: 'completed' },
      { id: 'b', status: 'completed' },
      { id: 'c', after: ['a', 'b'] },
      { id: 'd', after: ['b'] },
    ]);
    const diagram = diagramOf(run);
    expect(diagram).toMatchObject({ kind: 'graph', note: NOT_SERIES_PARALLEL_NOTE });
    if (diagram?.kind === 'graph') expect(diagram.source).toMatch(/^agentflow-beta LR/u);
  });

  it('writes an arena as its entries in parallel, then the judge', () => {
    const run = flowRunSchema.parse({
      flow: 'arena',
      status: 'completed',
      view: null,
      calls: [
        { invocation: 'a', kind: 'agent', target: 'self', handle: 'e0', status: 'completed' },
        { invocation: 'b', kind: 'agent', target: 'self', handle: 'e1', status: 'completed' },
      ],
      result: { answer: 'x', winner: 2, rationale: 'clearer' },
    });
    const diagram = diagramOf(run);
    if (diagram?.kind !== 'railroad') throw new Error('expected a railroad');
    expect(diagram.railroad.source).toBe(
      'railroad-beta\n  arena = sequence(choice(terminal("entry 1"), ' +
        'terminal("entry 2")), terminal("judge"));',
    );
    expect(diagram.railroad.marks.map((mark) => Boolean(mark.chosen))).toEqual([
      false,
      true,
      false,
    ]);
    expect(diagram.railroad.marks[2]!.title).toBe('The judge: picked entry 2.');
  });

  it('keeps a council synthesis run as its own call out of the members', () => {
    const run = flowRunSchema.parse({
      flow: 'council',
      status: 'completed',
      view: null,
      calls: [
        {
          invocation: 'a',
          kind: 'agent',
          target: 'clio/standard',
          handle: 'm0',
          status: 'completed',
          together: 'a',
        },
        {
          invocation: 'b',
          kind: 'agent',
          target: 'clio/standard',
          handle: 'm1',
          status: 'completed',
          together: 'a',
        },
        { invocation: 'c', kind: 'agent', target: 'self', handle: 's', status: 'completed' },
      ],
      result: { answer: 'x', members: ['m0', 'm1'], synthesizer: 's' },
    });
    expect(flowMembers(run, 'clio/standard').map((member) => member.handle)).toEqual(['m0', 'm1']);
    const running = flowRunSchema.parse({ ...run, status: 'running', result: null });
    expect(flowMembers(running, 'clio/standard').map((member) => member.handle)).toEqual([
      'm0',
      'm1',
    ]);
    const diagram = diagramOf(run);
    if (diagram?.kind !== 'railroad') throw new Error('expected a railroad');
    expect(diagram.railroad.source).toContain('terminal("member 2")');
    expect(diagram.railroad.source).not.toContain('member 3');
  });

  it('draws any other flow from its calls: each batch side by side, batches in order', () => {
    // A debate: two sides together, the judge alone, then the next round.
    const run = flowRunSchema.parse({
      flow: 'debate',
      status: 'running',
      view: null,
      calls: [
        { invocation: 'r1a', kind: 'agent', target: 'self', status: 'completed', together: 'r1a' },
        { invocation: 'r1b', kind: 'agent', target: 'self', status: 'completed', together: 'r1a' },
        { invocation: 'j1', kind: 'agent', target: 'self', status: 'completed' },
        { invocation: 'r2a', kind: 'agent', target: 'self', status: 'running', together: 'r2a' },
        { invocation: 'r2b', kind: 'agent', target: 'self', status: 'running', together: 'r2a' },
      ],
    });
    const diagram = diagramOf(run);
    if (diagram?.kind !== 'railroad') throw new Error('expected a railroad');
    expect(diagram.railroad.source).toBe(
      'railroad-beta\n  debate = sequence(choice(terminal("call 1"), terminal("call 2")), ' +
        'terminal("call 3"), choice(terminal("call 4"), terminal("call 5")));',
    );
    expect(diagram.label).toMatch(/^The debate flow's 5 calls as they ran: Call 1, done/u);
  });

  it("names any other flow's calls by the agent each ran", () => {
    // A research flow: two researchers together, then one critic.
    const run = flowRunSchema.parse({
      flow: 'deep-research',
      status: 'completed',
      view: null,
      calls: [
        {
          invocation: 'a',
          kind: 'subagent',
          target: 'researcher',
          status: 'completed',
          together: 'a',
        },
        {
          invocation: 'b',
          kind: 'subagent',
          target: 'researcher',
          status: 'completed',
          together: 'a',
        },
        { invocation: 'c', kind: 'subagent', target: 'critic', status: 'completed' },
      ],
    });
    expect(flowMembers(run, 'clio/deep-researcher').map((member) => member.label)).toEqual([
      'researcher 1',
      'researcher 2',
      'critic',
    ]);
  });

  it('times a run by its root task, and waits for that time instead of a partial span', () => {
    const run = flowRunSchema.parse({
      flow: 'deep-research',
      status: 'completed',
      view: null,
      calls: [],
    });
    // One member loaded so far: five minutes of a run that took thirty-eight.
    const member = new Map([['m1', { startedAt: 0, settledAt: 300_000 }]]);
    expect(flowRunElapsed(run, 'root', member, 10_000_000)).toBeUndefined();
    const loaded = new Map([...member, ['root', { startedAt: 0, settledAt: 2_280_000 }]]);
    expect(flowRunElapsed(run, 'root', loaded, 10_000_000)).toBe(2_280_000);
    // Without a root task, the members' span is the run.
    expect(flowRunElapsed(run, '', member, 10_000_000)).toBe(300_000);
  });

  it("draws a workflow step that runs any flow inline, from that flow's calls", () => {
    const run = workflow(
      [
        {
          id: 'takes',
          target: 'two-takes',
          status: 'completed',
          handle: 't_takes',
          invocation: 'flowrun_1:flow:key=step:takes:cc:0',
        },
      ],
      { calls: [{ invocation: 'flowrun_1:flow:key=step:takes:cc:0', kind: 'flow' }] },
    );
    const nested = flowRunSchema.parse({
      flow: 'two-takes',
      status: 'completed',
      view: null,
      calls: [
        { invocation: 'o', kind: 'agent', target: 'self', status: 'completed', together: 'o' },
        { invocation: 's', kind: 'agent', target: 'self', status: 'completed', together: 'o' },
      ],
    });
    const diagram = diagramOf(run, new Map([['takes', nested]]));
    if (diagram?.kind !== 'railroad') throw new Error('expected a railroad');
    expect(diagram.railroad.source).toBe(
      '---\nconfig:\n  railroad:\n    verticalSeparation: 44\n---\n' +
        'railroad-beta\n  workflow = choice(terminal("call 1"), terminal("call 2"));',
    );
    expect(diagram.railroad.boxes).toEqual([expect.objectContaining({ label: 'takes' })]);
  });

  it('keeps labels inside quotes and rule names to identifiers', () => {
    const diagram = railroadDiagram('my-workflow', {
      kind: 'terminal',
      label: 'say "hi"\\now',
      mark: { tone: 'done', title: '', key: 'k', pick },
    });
    expect(diagram.source).toBe(`railroad-beta\n  my_workflow = terminal("say 'hi''now");`);
  });
});

describe('markRailroad', () => {
  it('marks nodes in drawing order as buttons, labels parallel groups, drops the rule name', () => {
    const svg = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">
        <g class="pele-rule"><text class="pele-rule-name">workflow</text>
          <g class="pele-node pele-terminal"><rect x="10" y="40" width="40" height="26"/></g>
          <g class="pele-node pele-terminal"><rect x="60" y="40" width="40" height="26"/></g>
          <g class="pele-node pele-terminal"><rect x="60" y="76" width="40" height="26"/></g>
          <g class="pele-node pele-nonterminal"><rect x="120" y="40" width="40" height="26"/></g>
        </g>
      </svg>`,
      'image/svg+xml',
    ).documentElement as unknown as SVGElement;
    markRailroad(
      svg,
      {
        source: '',
        marks: [
          { tone: 'done', title: 'a: Completed.', key: 'a', pick },
          { tone: 'running', title: 'b: Running.', key: 'b', pick, chosen: true },
          { tone: 'failed', title: 'c: Failed.', key: 'c', pick },
          { tone: 'waiting', title: 'pick: Waiting.', key: 'pick', pick },
        ],
        parallels: [{ from: 1, to: 3, count: 2 }],
        boxes: [],
      },
      true,
    );
    const nodes = [...svg.querySelectorAll('g.pele-node')];
    expect(nodes.map((node) => node.getAttribute('class'))).toEqual([
      'pele-node pele-terminal st-done',
      'pele-node pele-terminal st-running is-chosen',
      'pele-node pele-terminal st-failed',
      'pele-node pele-nonterminal st-waiting',
    ]);
    expect(nodes[1]!.querySelector('title')?.textContent).toBe('b: Running.');
    expect(nodes[1]!.getAttribute('data-key')).toBe('b');
    expect(nodes[1]!.getAttribute('role')).toBe('button');
    expect(nodes[1]!.getAttribute('aria-label')).toBe('b: Running.');
    expect(nodes[1]!.getAttribute('tabindex')).toBe('0');
    const parallel = svg.querySelector('.clio-flow-parallel');
    expect(parallel?.textContent).toBe('2 in parallel');
    expect(parallel?.getAttribute('y')).toBe('36');
    expect(svg.querySelector('.pele-rule-name')).toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 12 300 188');
  });
});

describe('boxName', () => {
  it("reads a step's name as a title", () => {
    expect(boxName('headline')).toBe('Headline');
    expect(boxName('verify_hdf5-metadata')).toBe('Verify hdf5 metadata');
  });
});

describe('recorded flow execution progress', () => {
  it('keeps returned children green, review rejection red and delivery unrun', () => {
    const run = flowRunSchema.parse({
      flow: 'deep-research',
      status: 'flow_stall',
      view: null,
      execution: [
        { id: 'start', label: 'Started', status: 'completed', after: [] },
        {
          id: 'a',
          label: 'Researcher',
          status: 'returned',
          after: ['start'],
          kind: 'agent',
          handle: 'ta',
        },
        {
          id: 'r',
          label: 'Report review',
          status: 'rejected',
          after: ['a'],
          detail: 'Missing comparison',
        },
        { id: 's', label: 'Save report', status: 'not_run', after: ['r'] },
      ],
    });
    const steps = workflowSteps(run, 'clio/deep-researcher');
    const diagram = diagramOf(run);
    if (diagram?.kind !== 'railroad') throw new Error('expected a railroad');
    expect(diagram.railroad.marks.map((mark) => [mark.tone, mark.title])).toEqual([
      ['done', 'Started: Completed.'],
      ['done', 'Researcher: Returned.'],
      ['failed', 'Report review: Rejected.'],
      ['cancelled', 'Save report: Did not run.'],
    ]);
    expect(steps[1]?.handle).toBe('ta');
    expect(steps[2]?.note).toBe('Missing comparison');
  });
  it('marks declared pending work as unrun once a workflow stops', () => {
    const run = workflow(
      [
        { id: 'ran', status: 'completed' },
        { id: 'blocked', status: 'pending', after: ['ran'] },
      ],
      { status: 'flow_error' },
    );
    expect(workflowSteps(run, '').map((step) => step.status.label)).toEqual([
      'Completed',
      'Did not run',
    ]);
  });
});
