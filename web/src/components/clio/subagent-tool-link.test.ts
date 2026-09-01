import type { SubagentRun, ToolInvocation } from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import { getPresentationOverrideCount } from '@/lib/presentation-overrides';
import { subagentsForTool } from './subagent-tool-link';

const child: SubagentRun = {
  id: 'task_geo',
  session_id: 'sess_correlation',
  child_session_id: 'sess_child',
  agent_id: 'geospatial',
  title: 'geospatial #1',
  state: 'running',
};

const spawnTool: ToolInvocation = {
  id: 'call_spawn',
  session_id: 'sess_correlation',
  name: 'spawn_agent_task',
  title: 'Start child agent',
  state: 'succeeded',
  output: { task_id: 'task_geo' },
};

describe('subagentsForTool', () => {
  it('records the tool correlation as a declared presentation override', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(subagentsForTool(spawnTool, { task_geo: child })).toEqual([child]);
    expect(getPresentationOverrideCount('sess_correlation')).toBe(1);

    warn.mockRestore();
  });

  it('reports nothing when the tool output carries no child reference', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const unrelated: SubagentRun = { ...child, id: 'task_other', session_id: 'sess_uncorrelated' };

    expect(
      subagentsForTool({ ...spawnTool, output: { ok: true } }, { task_other: unrelated }),
    ).toEqual([]);
    expect(getPresentationOverrideCount('sess_uncorrelated')).toBe(0);

    warn.mockRestore();
  });
});
