import { describe, expect, it } from 'vitest';
import type { Part } from '@clio/core';
import { buildAssistantTurnModel, type TurnRow } from '../../src/components/transcriptDelegationModel.js';
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

  it('DEDUPES a verbatim-repeated text body (clio #736: parent reprints the child answer)', () => {
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
    // The answer renders ONCE (no #736 double). The TERMINAL copy (main's delivery,
    // the row the turn ends on) is kept; the earlier child copy is dropped — so the
    // turn never ends on a bodyless host (B6) and the orchestrator's answer shows.
    expect(textRows).toHaveLength(1);
    expect(textRows[0]!.agent).toBe('main');
  });

  it('DEDUPES a near-repeated parent final answer with corrupted Windows paths', () => {
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
    // B6: the TERMINAL answer (main's — the row the turn ends on) is kept; the
    // earlier synthesis near-duplicate is dropped. Previously the terminal (main)
    // copy was dropped, stranding the turn on the preceding thinking host.
    expect(textRows).toHaveLength(1);
    expect(textRows[0]!.agent).toBe('main');
  });

  it('B6: keeps the main terminal answer after a thinking host (never ends on the host)', () => {
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
    expect(rows.filter((r) => r.kind === 'text')).toHaveLength(1);
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

  it('suppresses terminal parent completion reasoning after the synthesis answer', () => {
    const answer = `
### Region
Ridgecrest, Kern County, California (2019 Earthquake Sequence) was resolved.

Recommended GNSS station search radius: **100 km**.

Data staging, profiling, and visualization were not performed per the geospatial-only request.
`.repeat(4);
    const terminalReasoning = `
The user's request was explicit and scoped: "resolve only the geospatial target".

Both required child experts have already completed:
1. geospatial resolved the region with high confidence
2. synthesis aggregated the geospatial evidence into the final user-facing answer

The workflow_state reflects orchestration_stage=geospatial_resolution_complete.
The task is fully satisfied by the grounded evidence already returned by the children.
Per the orchestrator instructions, after synthesis completes, the parent finishes on the next turn.
`;
    const rows = buildAssistantTurnModel([
      handoff('h', 'main', 'synthesis', 'delegate.started'),
      text('synthesis-answer', 'synthesis', answer),
      handoff('done', 'main', 'synthesis', 'delegate.completed'),
      handoff('res', '', 'main', 'parent.resumed'),
      {
        type: 'thinking',
        id: 'terminal-reasoning',
        agent_id: 'main',
        thinking: terminalReasoning,
      } as unknown as Part,
    ])!.rows;

    expect(rows.some((r) => r.id === 'terminal-reasoning')).toBe(false);
    expect(rows.some((r) => r.kind === 'return' && r.agent === 'synthesis')).toBe(false);
    expect(rows.at(-1)).toMatchObject({ kind: 'text', agent: 'synthesis' });
  });

  it('suppresses live post-answer echoes after terminal workflow-complete reasoning', () => {
    const synthesisAnswer = `
## Region

**Ridgecrest, California - 2019 Earthquake Sequence**

Geospatial resolution identified the target event region with:
- Center: 35.6206924 N, 117.672097 W
- Search radius: 100 km

This analysis was limited to geospatial resolution only. No GNSS data staging,
analysis, or visualization was performed.
`;
    const terminalReasoning = `
The user request explicitly scoped the task to **geospatial resolution only**.

Workflow evidence:
- **Geospatial expert** (completed): Resolved the Ridgecrest event region.
- **Synthesis expert** (completed): Composed the final user-facing answer.

The accumulated \`workflow_state\` confirms the request scope and constraints.

All required work is complete. Synthesis is the terminal child per protocol - I
finish on the turn after it returns, carrying its answer. No further children
(analysis, data, visualization) are needed.
`;
    const rows = buildAssistantTurnModel([
      handoff('geo-start', 'main', 'geospatial', 'delegate.started'),
      toolCall('tc', 'geospatial', 'c1', 'geo_geocode', { query: 'Ridgecrest, California' }),
      toolResult('tr', 'geospatial', 'c1', 'display_name: Ridgecrest, CA'),
      handoff('syn-start', 'main', 'synthesis', 'delegate.started'),
      text('syn-answer', 'synthesis', synthesisAnswer),
      handoff('syn-done', 'main', 'synthesis', 'delegate.completed'),
      text('geo-echo', 'geospatial', '{ "event_center_latitude": 35.6206924 }'),
      {
        type: 'thinking',
        id: 'terminal-reasoning',
        agent_id: 'main',
        text: terminalReasoning,
      } as unknown as Part,
    ])!.rows;

    expect(rows.some((r) => r.id === 'geo-echo')).toBe(false);
    expect(rows.some((r) => r.id === 'terminal-reasoning')).toBe(false);
    expect(rows.at(-1)).toMatchObject({ id: 'syn-answer', kind: 'text', agent: 'synthesis' });
  });

  it('suppresses terminal workflow-complete reasoning with downstream-work wording', () => {
    const synthesisAnswer = `
## Region

The 2019 Ridgecrest earthquake sequence region has been resolved with high confidence.

## Scope clarification

The requested task was geospatial resolution only. No GNSS data staging,
profiling, analysis, or visualization has been performed.
`;
    const terminalReasoning = `
Both required children have completed:
1. **geospatial** returned high-confidence coordinates.
2. **synthesis** composed the user-facing answer.

The typed workflow_state confirms:
- \`geospatial.status = "resolved"\`
- \`task = "geospatial_resolution_only"\`

All claims in the user-facing answer are grounded in child evidence. No
downstream work (data acquisition, analysis, visualization) is required per the
explicit user scope. The task is complete.
`;
    const rows = buildAssistantTurnModel([
      handoff('syn-start', 'main', 'synthesis', 'delegate.started'),
      text('syn-answer', 'synthesis', synthesisAnswer),
      handoff('syn-done', 'main', 'synthesis', 'delegate.completed'),
      {
        type: 'thinking',
        id: 'terminal-reasoning-2',
        agent_id: 'main',
        text: terminalReasoning,
      } as unknown as Part,
    ])!.rows;

    expect(rows.some((r) => r.id === 'terminal-reasoning-2')).toBe(false);
    expect(rows.at(-1)).toMatchObject({ id: 'syn-answer', kind: 'text', agent: 'synthesis' });
  });

  it('suppresses terminal workflow-complete reasoning with returned-children wording', () => {
    const rows = buildAssistantTurnModel([
      handoff('syn-start', 'main', 'synthesis', 'delegate.started'),
      text('syn-answer', 'synthesis', '## Scope\n\nThe requested task was geospatial resolution only.'),
      handoff('syn-done', 'main', 'synthesis', 'delegate.completed'),
      {
        type: 'thinking',
        id: 'terminal-reasoning-3',
        agent_id: 'main',
        text: `
The workflow_state confirms the bounded scope: pipeline_scope="geospatial_then_synthesis",
user_constraints=["no_data_staging", "no_analysis", "no_visualization"],
task="geospatial_resolution_only". Both required children (geospatial and
synthesis) have returned grounded evidence, and all user constraints are
satisfied. The task is complete.
`,
      } as unknown as Part,
    ])!.rows;

    expect(rows.some((r) => r.id === 'terminal-reasoning-3')).toBe(false);
    expect(rows.at(-1)).toMatchObject({ id: 'syn-answer', kind: 'text', agent: 'synthesis' });
  });

  it('keeps a main-attributed final answer before finish/carry bookkeeping', () => {
    const answer = `
## Region

Ridgecrest, Kern County, California.

**Earthquake sequence center:** 35.6206924 N, -117.672097 W

**GNSS station discovery radius:** 75 km

This response provides the requested geospatial resolution parameters only.
`;
    const rows = buildAssistantTurnModel([
      handoff('syn-start', 'main', 'synthesis', 'delegate.started'),
      text('main-answer', 'main', answer),
      {
        type: 'thinking',
        id: 'terminal-reasoning-4',
        agent_id: 'main',
        text: `
Synthesis has returned. The requested task (geospatial resolution only) is
complete. No further children (data, analysis, visualization) are needed per the
user's explicit scope constraints. I now finish and carry synthesis's answer.
`,
      } as unknown as Part,
    ])!.rows;

    expect(rows.some((r) => r.id === 'terminal-reasoning-4')).toBe(false);
    expect(rows.at(-1)).toMatchObject({ id: 'main-answer', kind: 'text', agent: 'main' });
  });

  it('suppresses final completion reasoning with finish-carrying wording', () => {
    const rows = buildAssistantTurnModel([
      handoff('syn-start', 'main', 'synthesis', 'delegate.started'),
      text(
        'syn-answer',
        'synthesis',
        '## Region\n\nThe 2019 Ridgecrest earthquake sequence region has been resolved.',
      ),
      handoff('syn-done', 'main', 'synthesis', 'delegate.completed'),
      {
        type: 'thinking',
        id: 'terminal-reasoning-5',
        agent_id: 'main',
        text: `
The user requested geospatial resolution only for the 2019 Ridgecrest earthquake
sequence. Both required pipeline stages have now completed: (1) the geospatial
expert resolved the region, and (2) the synthesis expert has produced the final
user-facing answer. This is the turn after synthesis has returned, and the
workflow is genuinely complete; I now finish, carrying the synthesis answer
forward.
`,
      } as unknown as Part,
    ])!.rows;

    expect(rows.some((r) => r.id === 'terminal-reasoning-5')).toBe(false);
    expect(rows.at(-1)).toMatchObject({ id: 'syn-answer', kind: 'text', agent: 'synthesis' });
  });

  it('suppresses final completion reasoning with executed-workflow wording', () => {
    const rows = buildAssistantTurnModel([
      handoff('syn-start', 'main', 'synthesis', 'delegate.started'),
      text(
        'syn-answer',
        'synthesis',
        '## Region\n\nRidgecrest geospatial resolution complete. No GNSS data staging was performed.',
      ),
      handoff('syn-done', 'main', 'synthesis', 'delegate.completed'),
      {
        type: 'thinking',
        id: 'terminal-reasoning-6',
        agent_id: 'main',
        text: `
The workflow has already executed:

1. geospatial child: Successfully resolved the event center.
2. synthesis child: Produced the final user-facing answer.

The typed workflow_state confirms the geospatial_resolution_only constraint.
The task is complete. I now finish and carry the synthesis answer to the user.
`,
      } as unknown as Part,
    ])!.rows;

    expect(rows.some((r) => r.id === 'terminal-reasoning-6')).toBe(false);
    expect(rows.at(-1)).toMatchObject({ id: 'syn-answer', kind: 'text', agent: 'synthesis' });
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

  it('strips bare progress scaffolding from text rows', () => {
    const rows = buildAssistantTurnModel([
      handoff('h', 'main', 'data', 'delegate.started'),
      text('t', 'data', 'In progress: acquiring data.\n\nCompleted:\n- catalog staged'),
    ])!.rows;
    const textRow = rows.find((r): r is Extract<TurnRow, { kind: 'text' }> => r.kind === 'text')!;
    expect(textRow.text).toBe('Completed:\n- catalog staged');
  });

  it('strips generated parenthetical routing/status scaffolding from text rows', () => {
    const rows = buildAssistantTurnModel([
      handoff('h', 'main', 'data', 'delegate.started'),
      text(
        't',
        'main',
        '(No user-facing answer yet - work is delegated. Awaiting child expert evidence.)\n\n(Orchestration in progress - awaiting visualization and synthesis results.)\n\nRouting complete.',
      ),
    ])!.rows;
    const textRow = rows.find((r): r is Extract<TurnRow, { kind: 'text' }> => r.kind === 'text')!;
    expect(textRow.text).toBe('Routing complete.');
  });

  it('strips live orchestration placeholders discovered in real EarthScope reloads', () => {
    const rows = buildAssistantTurnModel([
      text('a', 'main', 'Awaiting geospatial resolution. No evidence yet from child expert.'),
      text('a2', 'main', 'Pending geospatial delegation. No answer available until event coordinates are resolved.'),
      text(
        'a3',
        'main',
        'Delegating to geospatial to resolve the 2019 Ridgecrest earthquake sequence into event center coordinates and GNSS search radius. Awaiting child evidence before routing to synthesis and finishing.',
      ),
      handoff('h', 'main', 'geospatial', 'delegate.started', 'Resolve the region'),
      text('b', 'main', 'Routing to synthesis to produce the final user-facing answer.'),
      text(
        'b1',
        'main',
        'Routing to synthesis for final answer formatting. Awaiting synthesis completion before finishing.',
      ),
      text(
        'b1b',
        'main',
        'Delegating to synthesis expert to compose the final user-facing answer from the completed geospatial resolution.',
      ),
      text(
        'b2',
        'main',
        'Routing to the geospatial expert to resolve the event. No evidence is available until the geospatial expert returns its tool results.\n\nAwaiting synthesis child expert to produce the final answer.',
      ),
      text('c', 'geospatial', 'Resolved region: **Ridgecrest**.'),
    ])!.rows;

    expect(rows.some((r) => r.kind === 'text' && r.text.includes('Awaiting'))).toBe(false);
    expect(rows.some((r) => r.kind === 'text' && r.text.includes('Routing to synthesis'))).toBe(
      false,
    );
    expect(rows.some((r) => r.kind === 'text' && r.text.includes('No evidence is available'))).toBe(
      false,
    );
    expect(rows.some((r) => r.kind === 'text' && r.text.includes('Pending geospatial'))).toBe(
      false,
    );
    expect(rows.some((r) => r.kind === 'text' && r.text.includes('Ridgecrest'))).toBe(true);
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
