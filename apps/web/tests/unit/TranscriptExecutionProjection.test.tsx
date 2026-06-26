import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';
import type { ExecutionTranscriptEvent } from '../../src/live.js';

afterEach(cleanup);

describe('Transcript execution projection', () => {
  it('projects CLIO execution events into one assistant timeline', () => {
    const executionEvents: ExecutionTranscriptEvent[] = [
      {
        sequence: 1,
        type: 'message.part.delta',
        payload: {
          delta: {
            text_append:
              'I am initiating the workflow to locate the nearest EarthScope station to San Diego.',
          },
        },
      },
      {
        sequence: 2,
        type: 'blueprint.delegation.started',
        payload: {
          actor: { agent_id: 'main' },
          payload: {
            parent_id: 'main',
            delegate_to: 'geospatial',
            question: '[redacted]:170 chars',
          },
        },
      },
      {
        sequence: 3,
        type: 'message.part.added',
        payload: {},
        part: {
          type: 'expert_handoff',
          text: 'main -> geospatial | running | delegate.started',
          metadata: {
            parent_id: 'main',
            agent_id: 'geospatial',
            question:
              'Resolve the place name "San Diego" to geographic coordinates.',
          },
        },
      },
      {
        sequence: 4,
        type: 'react.step.completed',
        payload: {
          actor: { agent_id: 'geospatial' },
          payload: {
            expert_id: 'geospatial',
            thought:
              'The request provides only a place name, so look it up with geo_geocode.',
            tool_name: 'geo_geocode',
            tool_args: { query: 'San Diego', countrycodes: 'us', limit: 1 },
            observation:
              "[{'display_name':'San Diego, San Diego County, California, United States','lat':32.7174202,'lon':-117.162772}]",
          },
        },
      },
      {
        sequence: 5,
        type: 'react.step.completed',
        payload: {
          actor: { agent_id: 'geospatial' },
          payload: {
            expert_id: 'geospatial',
            thought: 'Rank the candidate stations by distance.',
            tool_name: 'geo_filter_points_by_radius',
            tool_args: { radius_km: 50 },
            observation: {
              within_radius_count: 4,
              points: [
                { Site: 'P475', distance_km: 9.4807 },
                { Site: 'SIO5', distance_km: 15.9393 },
                { Site: 'P472', distance_km: 19.8584 },
                { Site: 'P473', distance_km: 20.0313 },
              ],
            },
          },
        },
      },
      {
        sequence: 6,
        type: 'react.step.completed',
        payload: {
          actor: { agent_id: 'geospatial' },
          payload: {
            expert_id: 'geospatial',
            thought: 'Stage the station CSV for analysis.',
            tool_name: 'ndp_stage_resource',
            tool_args: { url: 'P475.CI.LY_.20.csv' },
            observation: {
              local_path: '/tmp/run/P475.CI.LY_.20.csv',
              size_bytes: 51608375,
              content_type: 'text/csv',
            },
          },
        },
      },
      {
        sequence: 7,
        type: 'expert.extract.completed',
        payload: {
          actor: { agent_id: 'geospatial' },
          payload: {
            expert_id: 'geospatial',
            output:
              '{"center_lat":32.7174202,"center_lon":-117.162772,"radius_km":50,"confidence":"high","provenance":"osm_nominatim"}',
            structured: {
              workflow_state: {
                geospatial: {
                  region_name:
                    'San Diego, San Diego County, California, United States',
                  center_lat: 32.7174202,
                  center_lon: -117.162772,
                  radius_km: 50,
                  confidence: 'high',
                  provenance: 'osm_nominatim',
                },
              },
            },
          },
        },
      },
    ];

    render(() => (
      <Transcript
        density="normal"
        messages={[
          { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Find station' }] },
          {
            id: 'a1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'This accumulated assistant text should be replaced.' }],
          },
        ]}
        executionEvents={executionEvents}
      />
    ));

    expect(screen.getAllByText('GACT')).toHaveLength(1);
    expect(screen.getByText(/I am initiating the workflow/)).toBeTruthy();

    // RENDERING_SPEC §9: the projected live turn now renders through the SAME
    // clean AssistantTurnView the persisted path uses (flat, no boxes). The
    // delegation header is the `parent → agent` step; the task is its sub-line.
    const turn = screen.getByTestId('assistant-turn');
    const header = screen
      .getAllByTestId('assistant-turn-delegation-header')
      .find((n) => /geospatial/.test(n.textContent ?? ''))!;
    expect(header.querySelector('.trx-block__from')?.textContent).toBe('main');
    expect(header.querySelector('.trx-block__agent')?.textContent).toBe('geospatial');
    expect(header.textContent).toContain('→');
    expect(screen.getByText(/Resolve the place name/)).toBeTruthy();

    // Tool call display name is the tool name humanised verbatim (no per-tool
    // special-casing). Observations render by content type.
    expect(screen.getByText(/Geo Geocode/)).toBeTruthy();
    // The radius-filter observation is a structured object → its station ids
    // surface (content-typed), and the staged-resource path appears.
    expect(turn.textContent).toContain('P475');
    expect(turn.textContent).toContain('51608375');
    // The expert report summarises the structured state generically.
    expect(screen.getAllByText(/San Diego, San Diego County/).length).toBeGreaterThan(0);

    // The expert's return is folded into the delegation block's result.
    const result = screen
      .getAllByTestId('assistant-turn-result')
      .find((n) => /San Diego, San Diego County/.test(n.textContent ?? ''))!;
    expect(result).toBeTruthy();

    expect(screen.queryByText(/redacted/i)).toBeNull();
    expect(screen.queryByText(/This accumulated assistant text/)).toBeNull();
  });

  it('deduplicates repeated assistant prose across handoffs', () => {
    const bad =
      'I am initiating the process to find the nearest GNSS station to San Diego andgenerate a plot of its data. First, I will resolve the geographic coordinates for San Diego.';
    const good =
      'I am initiating the process to find the nearest GNSS station to San Diego and generate a plot of its data. First, I will resolve the geographic coordinates for San Diego.';

    render(() => (
      <Transcript
        density="normal"
        messages={[{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Find station' }] }]}
        executionEvents={[
          {
            sequence: 1,
            turnId: 'u1',
            type: 'message.part.delta',
            payload: { delta: { text_append: bad } },
          },
          {
            sequence: 2,
            turnId: 'u1',
            type: 'blueprint.delegation.started',
            payload: {
              actor: { agent_id: 'main' },
              payload: {
                parent_id: 'main',
                delegate_to: 'geospatial',
                question: 'Resolve San Diego.',
              },
            },
          },
          {
            sequence: 3,
            turnId: 'u1',
            type: 'message.part.added',
            payload: {},
            part: { type: 'text', text: good },
          },
        ]}
      />
    ));

    const text = screen.getByTestId('transcript').textContent ?? '';
    expect((text.match(/I am initiating the process/g) ?? []).length).toBe(1);
    expect(text).toContain('and generate a plot');
    expect(text).not.toContain('andgenerate');
  });

  it('groups projected CLIO execution by user turn', () => {
    const executionEvents: ExecutionTranscriptEvent[] = [
      {
        sequence: 1,
        turnId: 'u1',
        type: 'message.part.delta',
        payload: { delta: { text_append: 'first answer' } },
      },
      {
        sequence: 2,
        turnId: 'u1',
        type: 'react.step.completed',
        payload: {
          actor: { agent_id: 'main' },
          payload: { expert_id: 'main', thought: 'first thought', tool_name: 'finish', is_finish: true },
        },
      },
      {
        sequence: 3,
        turnId: 'u2',
        type: 'message.part.delta',
        payload: { delta: { text_append: 'second answer' } },
      },
      {
        sequence: 4,
        turnId: 'u2',
        type: 'react.step.completed',
        payload: {
          actor: { agent_id: 'main' },
          payload: { expert_id: 'main', thought: 'second thought', tool_name: 'finish', is_finish: true },
        },
      },
    ];

    render(() => (
      <Transcript
        density="normal"
        messages={[
          { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'first question' }] },
          { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'second question' }] },
        ]}
        executionEvents={executionEvents}
      />
    ));

    expect(screen.getAllByText('GACT')).toHaveLength(2);
    const text = screen.getByTestId('transcript').textContent ?? '';
    expect(text.indexOf('first question')).toBeLessThan(text.indexOf('first answer'));
    expect(text.indexOf('first answer')).toBeLessThan(text.indexOf('second question'));
    expect(text.indexOf('second question')).toBeLessThan(text.indexOf('second answer'));
  });

  it('summarizes projected workflow JSON text instead of dumping it', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'stage data' }] }]}
        executionEvents={[
          {
            sequence: 1,
            turnId: 'u1',
            type: 'message.part.delta',
            payload: {
              delta: {
                text_append: JSON.stringify({
                  catalog: { status: 'metadata_found' },
                  acquisition: {
                    status: 'staged',
                    local_path: '/tmp/run/P475.CI.LY_.20.csv',
                    analysis_ready: true,
                  },
                  resource_candidate: { resource_name: 'P475.CI.LY_.20.csv' },
                }),
              },
            },
          },
          {
            sequence: 2,
            turnId: 'u1',
            type: 'react.step.completed',
            payload: {
              actor: { agent_id: 'data' },
              payload: { expert_id: 'data', thought: 'continue', tool_name: 'finish', is_finish: true },
            },
          },
        ]}
      />
    ));

    const turn = screen.getByTestId('assistant-turn');
    // The workflow JSON is summarised, not dumped: the staged status + path
    // survive; the noisy `resource_candidate` envelope key does not.
    expect(turn.textContent).toMatch(/status: staged/);
    expect(turn.textContent).toContain('P475.CI.LY_.20.csv');
    expect(turn.textContent).not.toContain('resource_candidate');
  });

  it('keeps persisted assistant artifact evidence inside the projected turn', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'plot station' }] },
          {
            id: 'a1',
            role: 'assistant',
            parts: [
              {
                type: 'expert_handoff',
                text:
                  'Retained typed workflow state:\n' +
                  JSON.stringify({
                    workflow_state: {
                      artifact: {
                        columns: ['east', 'north', 'up'],
                        kind: 'gnss_timeseries_plot',
                        path: '/tmp/run/P475.CI.LY_.20.png',
                        status: 'ready',
                      },
                    },
                  }),
                metadata: { agent_id: 'visualization', parent_id: 'main' },
              },
            ],
          },
        ]}
        executionEvents={[
          {
            sequence: 1,
            turnId: 'u1',
            type: 'message.part.delta',
            payload: { delta: { text_append: 'working' } },
          },
          {
            sequence: 2,
            turnId: 'u1',
            type: 'react.step.completed',
            payload: {
              actor: { agent_id: 'main' },
              payload: { expert_id: 'main', thought: 'continue', tool_name: 'finish', is_finish: true },
            },
          },
        ]}
      />
    ));

    expect(screen.getAllByText('GACT')).toHaveLength(1);
    // The visualization handoff opens a delegation block; its persisted artifact
    // evidence surfaces in the block (header agent + result), rendered through
    // the unified AssistantTurnView.
    const turn = screen.getByTestId('assistant-turn');
    const header = screen
      .getAllByTestId('assistant-turn-delegation-header')
      .find((n) => /visualization/.test(n.textContent ?? ''))!;
    expect(header.querySelector('.trx-block__agent')?.textContent).toBe('visualization');
    expect(turn.textContent).toContain('gnss_timeseries_plot');
    expect(turn.textContent).toContain('P475.CI.LY_.20.png');
  });
});
