import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  formatToolDuration,
  getToolOutcome,
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

describe('getToolPresentation', () => {
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

  it('preserves normal tool titles', () => {
    expect(
      getToolPresentation({
        id: 'tool-2',
        session_id: 'session-1',
        name: 'fs_read_file',
        title: 'Read file',
        state: 'succeeded',
      }),
    ).toEqual({ title: 'Read file', kind: 'tool' });
  });

  it('replaces machine syntax with a curated child-agent action title', () => {
    expect(
      getToolPresentation({
        id: 'tool-wait',
        session_id: 'session-1',
        name: 'wait_agent_tasks',
        title: 'wait(tasks)',
        state: 'succeeded',
      }),
    ).toEqual({ title: 'Wait for child agents', kind: 'tool' });
  });

  it('uses clean fallbacks for namespaced tool identifiers', () => {
    expect(humanizeToolName('fs_read_file')).toBe('Read file');
    expect(humanizeToolName('fs_propose_edit')).toBe('Propose file change');
    expect(humanizeToolName('fs_apply_edit_write')).toBe('Apply file change');
    expect(humanizeToolName('mcp__filesystem__read_file')).toBe('Read file');
    expect(humanizeToolName('shell_bash')).toBe('Run command');
    expect(humanizeToolName('geo_geocode')).toBe('Geocode');
    expect(humanizeToolName('observe_agent_tasks')).toBe('Watch child agents');
    expect(humanizeToolName('tool_call')).toBe('Tool calls');
    expect(humanizeToolName('pandas_filter_data')).toBe('Filter data');
    expect(humanizeToolName('pandas_profile_csv')).toBe('Profile data');
    expect(humanizeToolName('ndp_stage_resource')).toBe('Stage dataset');
    expect(humanizeToolName('geo_filter_points_by_radius')).toBe('Filter points by radius');
    expect(humanizeToolName('plot_plot_timeseries')).toBe('Plot time series');
    expect(humanizeToolName('plot_timeseries')).toBe('Plot time series');
    expect(humanizeToolName('ndp_search_datasets')).toBe('Search datasets');
  });

  it('summarizes a completed file operation without exposing its raw payload', () => {
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
  });

  it('keeps authoritative search results visible in the summary', () => {
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
  });

  it('summarizes registered artifacts and formats noisy wire durations', () => {
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

  it('separates successful tool transport from a halted operational outcome', () => {
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
    expect(getToolOutcome(halted)).toMatchObject({
      value: 'interrupted',
      label: 'Halted',
      domainStatus: 'halted',
    });
    expect(getToolSummary(halted)).toBe('CAMPAIGN HALTED — quarantined by SPOTTER AI.');
  });

  it('summarizes structured scientific batches instead of exposing a generic completion word', () => {
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
    expect(getToolOutcome(completed)).toMatchObject({ value: 'completed', label: 'Completed' });
    expect(getToolSummary(completed)).toBe('2 runs completed, mean biomass 120.48.');
  });
});
