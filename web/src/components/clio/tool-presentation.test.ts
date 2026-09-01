import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  formatToolDuration,
  getToolPresentation,
  getToolSummary,
  humanizeToolName,
} from './tool-presentation';

function tool(state: ToolInvocation['state']): ToolInvocation {
  return {
    id: 'tool-1',
    session_id: 'session-1',
    name: 'create_a2ui_surface',
    title: 'Create Interactive Surface',
    state,
  };
}

describe('tool presentation', () => {
  it('presents A2UI production as a first-class analysis view', () => {
    expect(getToolPresentation(tool('running'))).toEqual({
      title: 'Building analysis view',
      kind: 'analysis-view',
    });
    expect(getToolPresentation(tool('succeeded'))).toEqual({
      title: 'Analysis view created',
      kind: 'analysis-view',
    });
  });

  it('preserves server-provided tool titles verbatim', () => {
    expect(
      getToolPresentation({
        id: 'tool-2',
        session_id: 'session-1',
        name: 'fs_read_file',
        title: 'Read file',
        state: 'succeeded',
      }),
    ).toEqual({ title: 'Read file', kind: 'tool' });
    expect(
      getToolPresentation({
        id: 'tool-wait',
        session_id: 'session-1',
        name: 'wait_agent_tasks',
        title: 'wait(tasks)',
        state: 'succeeded',
      }),
    ).toEqual({ title: 'wait(tasks)', kind: 'tool' });
  });

  it('uses audited fallbacks for namespaced identifiers', () => {
    expect(humanizeToolName('fs_read_file')).toBe('Read file');
    expect(humanizeToolName('fs_propose_edit')).toBe('Propose file change');
    expect(humanizeToolName('mcp__filesystem__read_file')).toBe('Read file');
    expect(humanizeToolName('shell_bash')).toBe('Run command');
    expect(humanizeToolName('observe_agent_tasks')).toBe('Watch child agents');
    expect(humanizeToolName('ndp_stage_resource')).toBe('Stage dataset');
    expect(humanizeToolName('geo_filter_points_by_radius')).toBe('Filter points by radius');
    expect(humanizeToolName('plot_plot_timeseries')).toBe('Plot time series');
  });

  it('summarizes completed file, search, artifact, and duration values', () => {
    expect(
      getToolSummary({
        id: 'tool-3',
        session_id: 'session-1',
        name: 'fs_read_file',
        state: 'succeeded',
        input: { path: 'D:/campaign/evidence.json' },
        output: 'a very large file payload',
      }),
    ).toBe('Read evidence.json.');
    expect(
      getToolSummary({
        id: 'tool-4',
        session_id: 'session-1',
        name: 'catalog_search',
        state: 'succeeded',
        input: { query: 'GNSS station displacement' },
        output: { summary: 'Found 3 matching datasets.' },
      }),
    ).toBe('Searched for GNSS station displacement. Found 3 matching datasets.');
    expect(
      getToolSummary({
        id: 'tool-5',
        session_id: 'session-1',
        name: 'create_artifact',
        state: 'succeeded',
        input: { name: 'D:/campaign/evidence.md' },
        output: { created: 1, artifacts: [{ name: 'evidence.md' }] },
      }),
    ).toBe('Created evidence.md.');
    expect(formatToolDuration(674.0021705627441)).toBe('674 ms');
    expect(formatToolDuration(12_500)).toBe('12.5 s');
  });

  it('reports a halted domain outcome in the summary without restating the tool state', () => {
    const halted = {
      id: 'tool-halted',
      session_id: 'session-1',
      name: 'phenotype_measure_cohort',
      state: 'succeeded' as const,
      output: {
        status: 'halted',
        message: 'CAMPAIGN HALTED — quarantined by SPOTTER AI.',
        runs: [],
      },
    };
    expect(getToolSummary(halted)).toBe('CAMPAIGN HALTED — quarantined by SPOTTER AI.');
  });

  it('summarizes structured scientific batches', () => {
    const completed = {
      id: 'tool-batch',
      session_id: 'session-1',
      name: 'phenotype_measure_cohort',
      state: 'succeeded' as const,
      output: {
        status: 'completed',
        runs: [{ run_id: 'run-011' }, { run_id: 'run-012' }],
        summary: { run_count: 2, mean_biomass_avg: 120.475401 },
      },
    };
    expect(getToolSummary(completed)).toBe('2 runs completed, mean biomass 120.48.');
  });
});
