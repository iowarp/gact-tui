import { describe, expect, it } from 'vitest';
import type { Part } from '@clio/core';
import { buildAssistantTurnModel, type TurnRow } from '../../src/components/transcriptDelegationModel.js';

/** Clean-stream part factories (the 4-atom ReAct wire: text / handoff / tool). */
const text = (id: string, agent: string, t: string): Part =>
  ({ type: 'text', id, agent_id: agent, text: t } as unknown as Part);
const handoff = (
  id: string,
  parent: string,
  child: string,
  stage: string,
  question = '',
): Part =>
  ({
    type: 'expert_handoff',
    id,
    agent_id: parent,
    parent_agent: parent,
    child_agent: child,
    stage,
    status: 'completed',
    metadata: question ? { question } : {},
  } as unknown as Part);
const toolCall = (id: string, agent: string, callId: string, name: string, input: unknown): Part =>
  ({ type: 'tool_call', id, agent_id: agent, call_id: callId, tool_name: name, input } as unknown as Part);
const toolResult = (id: string, agent: string, callId: string, content: unknown): Part =>
  ({ type: 'tool_result', id, agent_id: agent, call_id: callId, content } as unknown as Part);

const kinds = (rows: TurnRow[]) => rows.map((r) => r.kind);

describe('buildAssistantTurnModel — ordered append-only row log', () => {
  it('returns null for a turn with no delegation structure', () => {
    expect(buildAssistantTurnModel([text('t', 'main', 'hi')])).toBeNull();
  });

  it('preserves WIRE ARRIVAL ORDER (geospatial before data, never regrouped)', () => {
    const parts = [
      text('p1', 'main', 'Orchestrating: routing to geospatial'),
      handoff('p2', 'main', 'geospatial', 'delegate.started', 'Resolve LA'),
      text('p3', 'geospatial', 'Resolved region: Los Angeles'),
      handoff('p4', 'main', 'geospatial', 'delegate.completed'),
      handoff('p5', '', 'main', 'parent.resumed'),
      text('p6', 'main', 'Routing to data expert'),
      handoff('p7', 'main', 'data', 'delegate.started', 'Discover stations'),
      text('p8', 'data', 'Found 155 stations'),
    ];
    const model = buildAssistantTurnModel(parts)!;
    expect(model).not.toBeNull();
    // Rows are in arrival order: main text, the geospatial delegation+prose come
    // BEFORE the data delegation+prose. No regrouping, no reordering.
    const agentsInOrder = model.rows
      .filter((r): r is Extract<TurnRow, { kind: 'text' | 'delegation' }> =>
        r.kind === 'text' || r.kind === 'delegation',
      )
      .map((r) => (r.kind === 'delegation' ? `→${r.agent}` : r.agent));
    expect(agentsInOrder).toEqual([
      'main',
      '→geospatial',
      'geospatial',
      'main',
      '→data',
      'data',
    ]);
  });

  it('DEDUPEs a delegation (started + completed + resumed) into ONE header', () => {
    const parts = [
      handoff('a', 'main', 'geospatial', 'delegate.started', 'task'),
      handoff('b', 'main', 'geospatial', 'delegate.completed'),
      handoff('c', '', 'main', 'parent.resumed'),
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    const delegations = rows.filter((r) => r.kind === 'delegation');
    expect(delegations).toHaveLength(1);
    expect(delegations[0]).toMatchObject({ parent: 'main', agent: 'geospatial', task: 'task' });
  });

  it('PAIRS a tool_call with its tool_result by call_id into one tool row', () => {
    const parts = [
      handoff('h', 'main', 'geo', 'delegate.started'),
      toolCall('tc', 'geo', 'c1', 'geo_geocode', { q: 'Los Angeles' }),
      toolResult('tr', 'geo', 'c1', 'display_name: Los Angeles, CA'),
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    const tools = rows.filter((r): r is Extract<TurnRow, { kind: 'tool' }> => r.kind === 'tool');
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('geo_geocode');
    expect(tools[0]!.argsSummary).toContain('Los Angeles');
    expect(tools[0]!.preview).toContain('Los Angeles');
    expect(tools[0]!.ok).toBe(true);
  });

  it('computes DEPTH: a delegation sits at the PARENT depth, the child works one level deeper', () => {
    const parts = [
      handoff('a', 'main', 'data', 'delegate.started'),
      text('t1', 'data', 'data prose'),
      handoff('b', 'data', 'ndp_dataset_discovery', 'delegate.started'),
      text('t2', 'ndp_dataset_discovery', 'child prose'),
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    const textRow = (a: string) =>
      rows.find((r): r is Extract<TurnRow, { kind: 'text' }> => r.kind === 'text' && r.agent === a)!;
    const delegationTo = (a: string) =>
      rows.find(
        (r): r is Extract<TurnRow, { kind: 'delegation' }> => r.kind === 'delegation' && r.agent === a,
      )!;
    // The child's WORK indents one level per delegation depth.
    expect(textRow('data').depth).toBe(1);
    expect(textRow('ndp_dataset_discovery').depth).toBe(2);
    // A delegation header renders at the PARENT's depth — one level ABOVE the
    // child's work (the delegation is the parent's turn, not the child's).
    expect(delegationTo('data').depth).toBe(0); // main -> data, at main's level
    expect(delegationTo('ndp_dataset_discovery').depth).toBe(1); // data -> ndp, at data's level
  });

  it('SUPPRESSES routing_decision plumbing rows (the real decision is the handoff)', () => {
    const parts = [
      handoff('h', 'main', 'geo', 'delegate.started'),
      { type: 'routing_decision', id: 'r', agent_id: 'main', selected_agent: 'geo' } as unknown as Part,
      toolCall('tc', 'geo', 'c1', 'geo_geocode', {}),
      toolResult('tr', 'geo', 'c1', 'ok'),
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    expect(rows.some((r) => r.kind === 'routing')).toBe(false);
  });

  it('DEDUPES a verbatim-repeated text body (clio #736: parent reprints the child answer)', () => {
    const answer = 'Resolved region: **Los Angeles** — center 34.05, −118.24';
    const parts = [
      handoff('h', 'main', 'geospatial', 'delegate.started'),
      text('t1', 'geospatial', answer), // the child's own answer
      handoff('done', 'main', 'geospatial', 'delegate.completed'),
      handoff('res', '', 'main', 'parent.resumed'),
      text('t2', 'main', answer), // main re-emits it verbatim → must be dropped
    ];
    const textRows = buildAssistantTurnModel(parts)!.rows.filter(
      (r): r is Extract<TurnRow, { kind: 'text' }> => r.kind === 'text',
    );
    expect(textRows).toHaveLength(1);
    expect(textRows[0]!.agent).toBe('geospatial');
  });

  it('keeps every row keyed by a stable, unique id', () => {
    const parts = [
      handoff('h1', 'main', 'geospatial', 'delegate.started'),
      text('t1', 'geospatial', 'a'),
      toolCall('tc1', 'geospatial', 'c1', 'geo_geocode', {}),
      toolResult('tr1', 'geospatial', 'c1', 'x'),
    ];
    const ids = buildAssistantTurnModel(parts)!.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('renders an agent prose row as text (markdown body), not a separate answer blob', () => {
    const parts = [
      handoff('h', 'main', 'geospatial', 'delegate.started'),
      text('t', 'geospatial', 'Resolved region: **Los Angeles**'),
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    const textRow = rows.find((r): r is Extract<TurnRow, { kind: 'text' }> => r.kind === 'text')!;
    expect(textRow.agent).toBe('geospatial');
    expect(textRow.text).toContain('Los Angeles');
  });

  it('unwraps a content-block tool_result envelope to the real output text', () => {
    // clio delivers tool output as [{id,type:'text',agent_id,text:'<output>'}] —
    // the row must show the output, NOT the envelope fields (id/type/agent_id).
    const parts = [
      handoff('h', 'main', 'geo', 'delegate.started'),
      toolCall('tc', 'geo', 'c1', 'geo_geocode', { q: 'Los Angeles' }),
      toolResult('tr', 'geo', 'c1', [
        {
          id: 'live_call_d3cc_result_text',
          type: 'text',
          agent_id: 'geo',
          text: 'display_name: Los Angeles, CA · lat: 34.05 · lon: -118.24',
        },
      ]),
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    const tool = rows.find((r): r is Extract<TurnRow, { kind: 'tool' }> => r.kind === 'tool')!;
    expect(tool.preview).toContain('Los Angeles');
    expect(tool.preview).not.toContain('agent_id');
    expect(tool.preview).not.toContain('live_call_d3cc');
    expect(tool.result).not.toContain('"type": "text"');
  });

  it('emits row kinds in order: text, delegation, tool, text', () => {
    const parts = [
      text('a', 'main', 'orchestrating'),
      handoff('b', 'main', 'geo', 'delegate.started'),
      toolCall('c', 'geo', 'c1', 'geo_geocode', {}),
      toolResult('d', 'geo', 'c1', 'ok'),
      text('e', 'geo', 'done'),
    ];
    expect(kinds(buildAssistantTurnModel(parts)!.rows)).toEqual([
      'text',
      'delegation',
      'tool',
      'text',
    ]);
  });
});
