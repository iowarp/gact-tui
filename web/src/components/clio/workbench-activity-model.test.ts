import type {
  AsyncProcess,
  PendingInteraction,
  Run,
  SessionDiff,
  ToolInvocation,
} from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  activityItems,
  compactDuration,
  filterActivity,
  type ActivityInput,
} from './workbench-activity-model';

const run = (id: string, started_at: string, state = 'completed') =>
  ({ id, session_id: 's', state, started_at }) as unknown as Run;
const tool = (fields: Partial<ToolInvocation> & { id: string; name: string }) =>
  ({ session_id: 's', state: 'completed', ...fields }) as unknown as ToolInvocation;

function input(fields: Partial<ActivityInput>): ActivityInput {
  return {
    tools: [],
    processes: [],
    subagents: [],
    runs: [],
    tasks: [],
    interactions: [],
    diffs: [],
    artifacts: [],
    ...fields,
  };
}

describe('activityItems', () => {
  it('lists running work in Now, this turn in This turn, and folds earlier turns', () => {
    const items = activityItems(
      input({
        runs: [run('r1', '2026-01-01T10:00:00Z'), run('r2', '2026-01-01T11:00:00Z', 'running')],
        tools: [
          tool({ id: 'old1', name: 'ndp_search', run_id: 'r1', duration_ms: 30 }),
          tool({ id: 'old2', name: 'ndp_fetch', run_id: 'r1', duration_ms: 40 }),
          tool({ id: 'now1', name: 'ndp_fetch', run_id: 'r2', state: 'running' }),
          tool({
            id: 'read',
            name: 'fs_read_file',
            run_id: 'r2',
            duration_ms: 40,
            input: { path: 'data/soil_sites.csv' },
          }),
        ],
      }),
    );
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));
    expect(byId['tool:now1']).toMatchObject({ group: 'now', running: true, trailing: 'running' });
    expect(byId['tool:read']).toMatchObject({
      group: 'turn',
      kind: 'file',
      name: 'Read soil_sites.csv',
      path: 'data/soil_sites.csv',
      trailing: '40ms',
    });
    expect(byId['turn:r1']).toMatchObject({
      group: 'earlier',
      name: 'Turn 1',
      trailing: '2 steps',
    });
    expect(byId['turn:r1']!.steps).toHaveLength(2);
    expect(byId['tool:old1']).toBeUndefined();
    // Groups come in reading order.
    expect(items.map((item) => item.group)).toEqual(['now', 'turn', 'earlier']);
  });

  it('lists a file change once, as an edit with its line counts', () => {
    const diff = {
      id: 'chg_1',
      path: 'scripts/regrid_stations.py',
      status: 'applied',
      created: false,
      lines_added: 2,
      lines_removed: 1,
      call_id: 'edit1',
      recorded_at: '2026-01-01T11:05:00Z',
    } as unknown as SessionDiff;
    const items = activityItems(
      input({
        runs: [run('r2', '2026-01-01T11:00:00Z')],
        tools: [
          tool({
            id: 'edit1',
            name: 'fs_edit_file',
            run_id: 'r2',
            input: { path: 'scripts/regrid_stations.py' },
          }),
        ],
        diffs: [diff],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'diff:chg_1',
      kind: 'diff',
      group: 'turn',
      name: 'Edited regrid_stations.py',
      trailing: '+2 \u22121',
      diff,
    });
  });

  it('puts running tasks with progress and open questions in Now', () => {
    const items = activityItems(
      input({
        processes: [
          {
            id: 'p1',
            handle: 'task_1',
            kind: 'download',
            title: 'Downloading SMAP L3',
            live_state: 'running',
            progress: { completed: 62, total: 100 },
            created_at: '2026-01-01T11:00:00Z',
          } as unknown as AsyncProcess,
        ],
        interactions: [
          {
            id: 'q1',
            kind: 'question',
            status: 'pending',
            title: 'Which region?',
            prompt: 'Which region should I fetch?',
            created_at: '2026-01-01T11:01:00Z',
            source: { tool_name: 'ask_user' },
          } as unknown as PendingInteraction,
        ],
      }),
    );
    expect(items.find((item) => item.id === 'process:p1')).toMatchObject({
      group: 'now',
      kind: 'process',
      running: true,
      trailing: '62%',
    });
    expect(items.find((item) => item.id === 'question:q1')).toMatchObject({
      group: 'now',
      kind: 'question',
      trailing: 'needs you',
    });
  });

  it('folds the plan, todos, goals and schedules in as work rows', () => {
    const items = activityItems(
      input({
        work: {
          todos: [
            { content: 'a', status: 'completed' },
            { content: 'b', status: 'pending' },
          ],
          goal: { id: 'g', title: 'Verify output', state: 'active', phase: 'working' },
          loop: null,
          schedules: [{ id: 'sc', question: 'Check results', enabled: true }],
        } as unknown as ActivityInput['work'],
      }),
    );
    expect(items.map((item) => [item.id, item.trailing, item.group])).toEqual(
      expect.arrayContaining([
        ['work:todos', '1/2', 'now'],
        ['work:goal:g', 'working', 'now'],
        ['work:schedule:sc', 'scheduled', 'now'],
      ]),
    );
    expect(items.every((item) => item.kind === 'work')).toBe(true);
  });
});

describe('filterActivity', () => {
  const items = activityItems(
    input({
      tools: [
        tool({ id: 'a', name: 'ndp_fetch', duration_ms: 40 }),
        tool({ id: 'b', name: 'fs_read_file', input: { path: 'soil_sites.csv' } }),
      ],
    }),
  );

  it('matches names and hides kinds', () => {
    expect(filterActivity(items, 'soil', new Set()).map((item) => item.id)).toEqual(['tool:b']);
    expect(filterActivity(items, '', new Set(['files'])).map((item) => item.id)).toEqual([
      'tool:a',
    ]);
    expect(filterActivity(items, '', new Set())).toBe(items);
  });
});

describe('compactDuration', () => {
  it('fits the trailing column', () => {
    expect(compactDuration(40)).toBe('40ms');
    expect(compactDuration(2400)).toBe('2.4s');
    expect(compactDuration(42_000)).toBe('42s');
    expect(compactDuration(9 * 60_000)).toBe('9m');
  });
});
