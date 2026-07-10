import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@clio/core';
import {
  buildAssistantTurnModel,
  messageSearchTexts,
  type TurnRow,
} from '../../src/components/transcriptDelegationModel.js';
import { analyzeToolResult } from '../../src/components/toolResultPreview.js';

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
/** A text part carrying its DSPy contract field (signature_field_name). */
const textField = (id: string, agent: string, t: string, field: string): Part =>
  ({ type: 'text', id, agent_id: agent, text: t, metadata: { signature_field_name: field } } as unknown as Part);
/** A provider (SDK) thinking part — becomes a collapsed reasoning host row. */
const thinking = (id: string, agent: string, t: string): Part =>
  ({
    type: 'thinking',
    id,
    agent_id: agent,
    thinking: t,
    metadata: { thinking_source: 'provider', provider_source: 'claude_code_sdk' },
  } as unknown as Part);

const kinds = (rows: TurnRow[]) => rows.map((r) => r.kind);

describe('buildAssistantTurnModel — ordered append-only row log', () => {
  it('builds a model for a no-delegation turn too (TOTAL builder — the single render path)', () => {
    // The builder is total: a plain single-agent turn projects to a text row and
    // renders through AssistantTurnView like every other turn (no flat fallback).
    const model = buildAssistantTurnModel([text('t', 'main', 'hi')]);
    expect(model).not.toBeNull();
    expect(model!.rows).toEqual([
      expect.objectContaining({ kind: 'text', agent: 'main', text: 'hi', depth: 0 }),
    ]);
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

  it('renders explicit child return handoffs from completed delegation events', () => {
    const parts = [
      handoff('a', 'main', 'geospatial', 'delegate.started', 'task'),
      {
        ...handoff('b', 'main', 'geospatial', 'delegate.completed'),
        metadata: { output_summary: 'Region resolved and ready.' },
      } as unknown as Part,
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    const returns = rows.filter((r): r is Extract<TurnRow, { kind: 'return' }> => r.kind === 'return');
    expect(returns).toEqual([
      expect.objectContaining({
        agent: 'geospatial',
        parent: 'main',
        depth: 1,
        text: 'Region resolved and ready.',
      }),
    ]);
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

  it('does NOT dedup a verbatim-repeated text body — the client preserves content; a real backend #736 double-emit is fixed at source, not hidden here (#48)', () => {
    const answer = 'Resolved region: **Los Angeles** — center 34.05, −118.24';
    const parts = [
      handoff('h', 'main', 'geospatial', 'delegate.started'),
      text('t1', 'geospatial', answer), // the child's own answer (earlier → dropped)
      handoff('done', 'main', 'geospatial', 'delegate.completed'),
      handoff('res', '', 'main', 'parent.resumed'),
      text('t2', 'main', answer), // main's TERMINAL delivery of the same answer → kept
    ];
    const textRows = buildAssistantTurnModel(parts)!.rows.filter(
      (r): r is Extract<TurnRow, { kind: 'text' }> => r.kind === 'text',
    );
    // No client-side dedup: BOTH copies render, in wire order. If clio genuinely
    // double-emits (#736), that is fixed in the agent, not silently hidden here.
    expect(textRows).toHaveLength(2);
    expect(textRows.map((r) => r.agent)).toEqual(['geospatial', 'main']);
  });

  it('does NOT near-dedup a parent final answer — no client-side near-duplicate detection (#48)', () => {
    const synthesisAnswer = `
### Region
Los Angeles, California. Center: 34.0536909 N, 118.242766 W; 50 km search radius.

### Station selected
Station **MTA1** selected from 72 ranked EarthScope GNSS candidates.

### Data resource
- Staged CSV: \`D:\\Libraries\\Documents\\projects\\earthscope-web-check\\MTA1.CI.LY_.30.csv\`
- File size: 50.4 MB
- Total rows: 250,000
- Source URL: https://ds2.datacollaboratory.org/Earthscope_api_dec2024/raw_csv/MTA1.CI.LY_.30.csv
- Status: analysis_ready

### Profile evidence
Profiling analyzed 5,000 rows. East, North, and Up displacement ranges were present.

### Visualization
- PNG timeseries plot: \`D:\\Libraries\\Documents\\projects\\earthscope-web-check\\MTA1.png\`

### Freshness, coverage & provenance limitations
The profile is scan-limited. Full-file cadence, duration, gap structure, and multi-station temporal alignment remain unverified.
`;
    const parentCopy = synthesisAnswer
      .replace(
        'D:\\Libraries\\Documents\\projects\\earthscope-web-check\\MTA1.CI.LY_.30.csv',
        'D:\\Libraries\\Documents\\projects\\earthscope-web-check\\D:\\Libraries\\Documents\\projects\\earthscope-web-check\\MTA1.CI.LY_.30.csv',
      )
      .replace(
        'https://ds2.datacollaboratory.org/Earthscope_api_dec2024/raw_csv/MTA1.CI.LY_.30.csv',
        'https://ds2.datacollaboratory.org/Earthscope_api_dec2024/raw_csv/D:\\Libraries\\Documents\\projects\\earthscope-web-check\\MTA1.CI.LY_.30.csv',
      );
    const parts = [
      handoff('h', 'main', 'synthesis', 'delegate.started'),
      text('synthesis-answer', 'synthesis', synthesisAnswer),
      handoff('done', 'main', 'synthesis', 'delegate.completed'),
      handoff('res', '', 'main', 'parent.resumed'),
      text('main-copy', 'main', parentCopy),
    ];
    const textRows = buildAssistantTurnModel(parts)!.rows.filter(
      (r): r is Extract<TurnRow, { kind: 'text' }> => r.kind === 'text',
    );
    // No client-side near-dedup: both the synthesis answer and main's near-duplicate
    // restatement render. The turn still ENDS on main's terminal answer.
    expect(textRows).toHaveLength(2);
    expect(textRows.at(-1)!.agent).toBe('main');
  });

  it('keeps the main terminal answer after a thinking host (never ends on the host), preserving the earlier copy too', () => {
    // Real EarthScope shape: synthesis returns its report, main resumes, emits a big
    // provider-thinking burst, then re-states the report as its terminal answer. The
    // dedup must keep main's TERMINAL text — not strand the turn on the empty host.
    const report = [
      '## Region',
      'Los Angeles, California (center 34.0536909, -118.242766, 50 km radius).',
      'Nearest station MTA1 selected from 72 ranked EarthScope GNSS candidates.',
      'Profiling analyzed 5,000 rows; East/North/Up displacement ranges were present.',
    ].join('\n');
    const parts = [
      handoff('h', 'main', 'synthesis', 'delegate.started'),
      text('syn-answer', 'synthesis', report),
      handoff('done', 'main', 'synthesis', 'delegate.completed'),
      handoff('res', '', 'main', 'parent.resumed'),
      thinking('main-think', 'main', 'X'.repeat(400)),
      text('main-answer', 'main', report),
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    // The turn ENDS on main's terminal answer, not on the thinking host.
    expect(rows.at(-1)).toMatchObject({ kind: 'text', agent: 'main', id: 'main-answer' });
    // No dedup: BOTH the synthesis report and main's terminal restatement render.
    expect(rows.filter((r) => r.kind === 'text')).toHaveLength(2);
    // The thinking host is still present (kept, not merged away).
    expect(
      rows.some((r) => r.kind === 'reasoning' && !!r.providerThinking?.text.trim()),
    ).toBe(true);
  });

  it('renders the dspy.extract (thinking + reasoning) in the FLOW, not folded onto the return', () => {
    // The extract's SDK thinking host + `reasoning` text render like every other turn
    // — thinking on top, streaming — NOT folded onto the return (folding bound them to
    // the end, so the thinking could not stream in). The return is a clean one-liner.
    const parts = [
      handoff('h', 'main', 'geospatial', 'delegate.started'),
      textField('geo-nt', 'geospatial', 'Los Angeles resolved; finishing now.', 'next_thought'),
      thinking('ex-th', 'geospatial', 'Y'.repeat(300)),
      textField(
        'geo-rz',
        'geospatial',
        'Los Angeles resolved to 34.05, -118.24 with a 50 km radius.',
        'reasoning',
      ),
      {
        type: 'expert_handoff',
        id: 'done',
        agent_id: 'geospatial',
        parent_agent: 'main',
        child_agent: 'geospatial',
        stage: 'delegate.completed',
        status: 'completed',
        metadata: { output_summary: 'Resolved Los Angeles to a bounded region.' },
      } as unknown as Part,
    ];
    const rows = buildAssistantTurnModel(parts)!.rows;
    const textIds = rows.filter((r) => r.kind === 'text').map((r) => r.id);
    // BOTH the finish next_thought and the extract reasoning render inline (they stream).
    expect(textIds).toContain('geo-nt');
    expect(textIds).toContain('geo-rz');
    // the extract's SDK thinking is a STANDALONE host in the flow (streams on top).
    expect(
      rows.filter((r) => r.kind === 'reasoning' && !!r.providerThinking?.text.trim()),
    ).toHaveLength(1);
    // the return is a clean one-liner — NO folded thinking.
    const ret = rows.find((r) => r.kind === 'return') as Extract<TurnRow, { kind: 'return' }>;
    expect(ret).toBeTruthy();
    expect(ret.providerThinking).toBeFalsy();
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

  it('renders agent prose VERBATIM — no scaffolding/placeholder scrubbing (epic #880)', () => {
    // The client is a pure verbatim renderer: it no longer strips status
    // parentheticals, "typed workflow state" captions, or orchestration
    // placeholders from model prose. The server owns the clean stream; whatever the
    // model authored renders exactly. (The three former scrubbing tests were
    // deleted with stripClioScaffolding / isOrchestrationPlaceholder / isBareJsonBody.)
    const raw =
      '(No user-facing answer yet - work is delegated. Awaiting child expert evidence.)\n\nRouting complete.';
    const rows = buildAssistantTurnModel([
      handoff('h', 'main', 'data', 'delegate.started'),
      text('t', 'main', raw),
    ])!.rows;
    const textRow = rows.find((r): r is Extract<TurnRow, { kind: 'text' }> => r.kind === 'text')!;
    expect(textRow.text).toBe(raw);
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

  it('projects a USER turn to plain text rows (isUser, no agent) through the same builder', () => {
    const model = buildAssistantTurnModel([text('u', '', 'find the LA stations')], {
      role: 'user',
    })!;
    expect(model.rows).toEqual([
      expect.objectContaining({ kind: 'text', isUser: true, text: 'find the LA stations', depth: 0 }),
    ]);
    // User prompt is NOT scaffolding-stripped or agent-attributed.
    expect((model.rows[0] as Extract<TurnRow, { kind: 'text' }>).agent).toBe('');
  });

  it('routes a synthetic command_result text part to a passthrough row (command card)', () => {
    const part = {
      type: 'text',
      id: 'cmd',
      agent_id: 'main',
      text: '[/cache-stats] ARC cache: hits=0 misses=0',
      metadata: { synthetic: 'command_result', command: '/cache-stats' },
    } as unknown as Part;
    const rows = buildAssistantTurnModel([part])!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('passthrough');
  });

  it('carries tool telemetry (cached + duration) onto the paired tool row', () => {
    const parts = [
      toolCall('tc', 'main', 'c1', 'read_file', {}),
      {
        type: 'tool_result',
        id: 'tr',
        agent_id: 'main',
        call_id: 'c1',
        output: 'ok',
        cached: true,
        duration_ms: 1234.6,
      } as unknown as Part,
    ];
    const tool = buildAssistantTurnModel(parts)!.rows.find(
      (r): r is Extract<TurnRow, { kind: 'tool' }> => r.kind === 'tool',
    )!;
    expect(tool.cached).toBe(true);
    expect(tool.durationMs).toBe(1234.6);
  });

  it('messageSearchTexts indexes the VERBATIM rendered text (so highlight keys align)', () => {
    const body = 'Evidence is ready.\n\nCLIO typed workflow state:\n{"workflow_state":{}}';
    const msg: Message = {
      id: 'm',
      role: 'assistant',
      parts: [{ type: 'text', text: body } as unknown as Part],
    } as unknown as Message;
    // The client is a verbatim renderer (epic #880): no scaffolding scrub runs, so
    // search indexes exactly the text the render shows — the full body, trimmed.
    expect(messageSearchTexts(msg)).toEqual([body]);
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

describe('tool result previews', () => {
  it('surfaces nested dataset/resource labels before scalar counters', () => {
    const result = analyzeToolResult(
      JSON.stringify({
        datasets: [
          {
            title: 'EarthScope Stations Dataset',
            resources: [{ name: 'earthscope_converted_data.csv', format: 'CSV' }],
          },
        ],
        count: 1,
        total_found: 1,
        server: 'global',
      }),
    );
    expect(result.preview).toContain('EarthScope Stations Dataset');
    expect(result.preview).toContain('earthscope_converted_data.csv');
    expect(result.preview.indexOf('EarthScope')).toBeLessThan(result.preview.indexOf('count'));
  });

  it('prioritizes useful artifact fields over low-signal ok booleans', () => {
    const result = analyzeToolResult(
      JSON.stringify({
        ok: true,
        local_path: 'D:\\Libraries\\Documents\\projects\\earthscope-web-check\\MTA1.CI.LY_.30.csv',
        size_bytes: 50424246,
        content_type: 'text/csv',
        url: 'https://example.test/MTA1.CI.LY_.30.csv',
      }),
    );
    expect(result.preview.startsWith('local_path:')).toBe(true);
    expect(result.preview).not.toContain('ok: true');
  });
});
