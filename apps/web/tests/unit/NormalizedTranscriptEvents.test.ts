import { describe, expect, it } from 'vitest';
import {
  applyNormalizedTranscriptEvent,
  emptyNormalizedTranscriptState,
} from '../../src/NormalizedTranscriptEvents.js';

describe('NormalizedTranscriptEvents', () => {
  it('folds a streamed agent/tool/return transcript into flat rows', () => {
    let state = emptyNormalizedTranscriptState();
    const apply = (type: string, payload: Record<string, unknown>) => {
      state = applyNormalizedTranscriptEvent(state, type, payload);
    };

    apply('turn.started', { turn_id: 'main-1', agent_id: 'main' });
    apply('turn.trace.delta', {
      turn_id: 'main-1',
      trace_id: 'trace-1',
      trace_kind: 'model_aux',
      text_append: 'provider aux',
    });
    apply('turn.text.delta', {
      turn_id: 'main-1',
      field: 'thought',
      text_append: 'Resolve geography.',
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'agent_call',
        call_id: 'call-geo',
        target_agent: 'geospatial',
        prompt: 'Resolve Los Angeles.',
      },
    });
    apply('turn.started', {
      turn_id: 'geo-1',
      agent_id: 'geospatial',
      parent_call_id: 'call-geo',
    });
    apply('turn.text.delta', {
      turn_id: 'geo-1',
      field: 'thought',
      text_append: 'Need grounded coordinates.',
    });
    apply('turn.action.added', {
      turn_id: 'geo-1',
      action: {
        kind: 'tool_call',
        call_id: 'tool-geo',
        tool_name: 'geo_geocode',
        input: { query: 'Los Angeles' },
      },
    });
    apply('call.result.delta', {
      call_id: 'tool-geo',
      text_append: 'display_name: Los Angeles\nlat: 34.0536909\nlon: -118.242766',
    });
    apply('turn.action.added', {
      turn_id: 'geo-1',
      action: {
        kind: 'return',
        call_id: 'return-geo',
        response: 'Resolved region: Los Angeles.',
      },
    });
    apply('state.updated', {
      turn_id: 'geo-1',
      visibility: 'hidden',
      value: { workflow_state: { region: 'LA' } },
    });

    expect(state.rows.map((row) => row.kind)).toEqual([
      'text',
      'delegation',
      'text',
      'tool',
      'return',
    ]);
    expect(state.rows[0]).toMatchObject({
      kind: 'text',
      agent: 'main',
      providerThinking: { text: 'provider aux', chars: 12 },
    });
    expect(state.rows[1]).toMatchObject({
      kind: 'delegation',
      parent: 'main',
      agent: 'geospatial',
      task: 'Resolve Los Angeles.',
      depth: 0,
    });
    expect(state.rows[2]).toMatchObject({
      kind: 'text',
      agent: 'geospatial',
      depth: 1,
      text: 'Need grounded coordinates.',
    });
    expect(state.rows[3]).toMatchObject({
      kind: 'tool',
      agent: 'geospatial',
      name: 'geo_geocode',
      preview: expect.stringContaining('Los Angeles'),
    });
    expect(state.rows[4]).toMatchObject({
      kind: 'return',
      agent: 'geospatial',
      parent: 'main',
      chars: 29,
    });
    expect(state.hiddenStateByTurn['geo-1']).toEqual({
      workflow_state: { region: 'LA' },
    });
  });

  it('infers nested depths from action agent ids in a single backend turn', () => {
    let state = emptyNormalizedTranscriptState();
    const apply = (type: string, payload: Record<string, unknown>) => {
      state = applyNormalizedTranscriptEvent(state, type, payload);
    };

    apply('turn.started', { turn_id: 'main-1', agent_id: 'main' });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'agent_call',
        call_id: 'call-geo',
        agent_id: 'main',
        target_agent: 'geospatial',
        prompt: 'Resolve Los Angeles.',
      },
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'tool_call',
        call_id: 'tool-geo',
        agent_id: 'geospatial',
        name: 'geo_geocode',
        args: { query: 'Los Angeles' },
      },
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'return',
        call_id: 'return-geo',
        agent_id: 'geospatial',
        target_agent: 'main',
        response: 'Resolved region.',
      },
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'agent_call',
        call_id: 'call-data',
        agent_id: 'main',
        target_agent: 'data',
        prompt: 'Discover stations.',
      },
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'agent_call',
        call_id: 'call-ndp',
        agent_id: 'data',
        target_agent: 'ndp_dataset_discovery',
        prompt: 'Stage metadata.',
      },
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'tool_call',
        call_id: 'tool-ndp',
        agent_id: 'ndp_dataset_discovery',
        name: 'ndp_search_datasets',
        args: { search_terms: ['earthscope'] },
      },
    });

    expect(state.rows).toMatchObject([
      { kind: 'delegation', agent: 'geospatial', depth: 0 },
      { kind: 'tool', agent: 'geospatial', depth: 1 },
      { kind: 'return', agent: 'geospatial', depth: 1 },
      { kind: 'delegation', agent: 'data', depth: 0 },
      { kind: 'delegation', agent: 'ndp_dataset_discovery', depth: 1 },
      { kind: 'tool', agent: 'ndp_dataset_discovery', depth: 2 },
    ]);
  });

  it('keeps same-turn text deltas as ordered agent-authored rows when part ids differ', () => {
    let state = emptyNormalizedTranscriptState();
    const apply = (type: string, payload: Record<string, unknown>) => {
      state = applyNormalizedTranscriptEvent(state, type, payload);
    };

    apply('turn.started', { turn_id: 'main-1', agent_id: 'main' });
    apply('turn.text.delta', {
      turn_id: 'main-1',
      agent_id: 'main',
      part_id: 'part-main-a',
      field: 'thought',
      text_append: 'Main thinks.',
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'agent_call',
        call_id: 'call-geo',
        agent_id: 'main',
        target_agent: 'geospatial',
        prompt: 'Resolve Los Angeles.',
      },
    });
    apply('turn.text.delta', {
      turn_id: 'main-1',
      agent_id: 'geospatial',
      part_id: 'part-geo-a',
      field: 'thought',
      text_append: 'Geo thinks.',
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'tool_call',
        call_id: 'tool-geo',
        agent_id: 'geospatial',
        name: 'geo_geocode',
        args: { query: 'Los Angeles' },
      },
    });
    apply('turn.text.delta', {
      turn_id: 'main-1',
      agent_id: 'geospatial',
      part_id: 'part-geo-a',
      field: 'thought',
      text_append: 'Geo continues after tool.',
    });
    apply('turn.action.added', {
      turn_id: 'main-1',
      action: {
        kind: 'return',
        call_id: 'return-geo',
        agent_id: 'geospatial',
        target_agent: 'main',
        response: 'Resolved region.',
      },
    });
    apply('turn.text.delta', {
      turn_id: 'main-1',
      agent_id: 'main',
      part_id: 'part-main-b',
      field: 'thought',
      text_append: 'Main resumes.',
    });

    expect(state.rows).toMatchObject([
      { kind: 'text', id: 'part-main-a', agent: 'main', text: 'Main thinks.', depth: 0 },
      { kind: 'delegation', agent: 'geospatial', depth: 0 },
      { kind: 'text', id: 'part-geo-a', agent: 'geospatial', text: 'Geo thinks.', depth: 1 },
      { kind: 'tool', agent: 'geospatial', depth: 1 },
      {
        kind: 'text',
        id: 'part-geo-a-4',
        agent: 'geospatial',
        text: 'Geo continues after tool.',
        depth: 1,
      },
      { kind: 'return', agent: 'geospatial', depth: 1 },
      { kind: 'text', id: 'part-main-b', agent: 'main', text: 'Main resumes.', depth: 0 },
    ]);
  });
});
