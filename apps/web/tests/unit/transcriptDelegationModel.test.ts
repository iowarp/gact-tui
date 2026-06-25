import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@clio/core';
import {
  buildAssistantTurnModel,
  reconcileTurnModel,
} from '../../src/components/transcriptDelegationModel.js';
import earthscopeRealTrace from '../visual/fixtures/earthscope-real-trace.json' with { type: 'json' };

const realAssistant = (earthscopeRealTrace as { messages: Message[] }).messages.find(
  (m) => m.role === 'assistant',
)!;

describe('buildAssistantTurnModel — real earthscope trace (backend-agnostic)', () => {
  const model = buildAssistantTurnModel(realAssistant.parts as Part[])!;

  it('returns a model for a turn carrying handoffs', () => {
    expect(model).not.toBeNull();
  });

  it('DEDUPEs the 10 handoffs (5 delegations x2) down to 5 blocks via the stage metadata', () => {
    expect(model.blocks).toHaveLength(5);
    expect(model.blocks.map((b) => b.agent)).toEqual([
      'geospatial',
      'data',
      'analysis',
      'visualization',
      'synthesis',
    ]);
  });

  it('gives every block a stable, unique id for keyed rendering', () => {
    const ids = model.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('places every delegated expert at depth 1 under its parent (parent_id walk)', () => {
    for (const block of model.blocks) {
      expect(block.depth).toBe(1);
      expect(block.parent).toBe('main');
    }
  });

  it('SURFACES the task sent to each expert (meta.question)', () => {
    const geospatial = model.blocks[0]!;
    expect(geospatial.task).toContain('Resolve Los Angeles');
    expect(geospatial.task).toContain('geocode');
    const data = model.blocks[1]!;
    expect(data.task).toContain('Discover EarthScope/NDP GNSS stations');
  });

  it('exposes each tool call (name verbatim) + a content-typed preview, in order', () => {
    const geospatial = model.blocks[0]!;
    expect(geospatial.tools).toHaveLength(1);
    expect(geospatial.tools[0]!.name).toBe('geo_geocode');
    expect(geospatial.tools[0]!.argsSummary).toContain('Los Angeles');
    // The geocode array is STRUCTURED json — rendered by content type, not by a
    // tool-name special case. The raw body is retained behind the fold.
    expect(geospatial.tools[0]!.content.kind).toBe('json');
    expect(geospatial.tools[0]!.result).toContain('display_name');
    expect(geospatial.tools[0]!.ok).toBe(true);

    const data = model.blocks[1]!;
    expect(data.tools.map((t) => t.name)).toEqual([
      'ndp_search_datasets',
      'ndp_stage_resource',
      'shell_bash',
      'shell_bash',
      'geo_filter_points_by_radius',
      'ndp_search_datasets',
      'ndp_stage_resource',
    ]);
  });

  it('detects a CSV stdout body as a TABLE by content (not by the shell tool name)', () => {
    const data = model.blocks[1]!;
    const headTool = data.tools.find(
      (t) => t.name === 'shell_bash' && t.argsSummary.includes('head -5'),
    )!;
    expect(headTool.content.kind).toBe('table');
    if (headTool.content.kind === 'table') {
      expect(headTool.content.columns.map((c) => c.name)).toContain('Site');
      expect(headTool.content.columns.map((c) => c.name)).toContain('Latitude');
    }
  });

  it('detects the CSV profile (columns[]) as a TABLE on the analysis turn', () => {
    const analysis = model.blocks.find((b) => b.agent === 'analysis')!;
    const profile = analysis.tools.find((t) => t.name === 'pandas_profile_csv')!;
    expect(profile.content.kind).toBe('table');
    if (profile.content.kind === 'table') {
      expect(profile.content.columns.map((c) => c.name)).toEqual([
        'time',
        'east',
        'north',
        'up',
        'sigEE',
        'sigNN',
        'sigUU',
        'qChannel',
      ]);
      expect(profile.content.rowCount).toBe(250000);
    }
  });

  it('detects the plot output_path as an inline IMAGE by extension (not by tool name)', () => {
    const viz = model.blocks.find((b) => b.agent === 'visualization')!;
    const plot = viz.tools.find((t) => t.name === 'plot_plot_timeseries')!;
    expect(plot.content.kind).toBe('image');
    expect(plot.imagePath).toMatch(/MTA1_GNSS_timeseries_displacement\.png$/);
  });

  it('gives every tool call a stable, unique id', () => {
    const data = model.blocks[1]!;
    const ids = data.tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('renders a prose result IN FULL, and never a workflow_state JSON blob', () => {
    const geospatial = model.blocks[0]!;
    expect(geospatial.result).toContain('Los Angeles');
    const data = model.blocks[1]!;
    expect(data.result).toContain('EarthScope Data Acquisition');
    for (const block of model.blocks) {
      // Display-only structured state is never rendered as prose.
      expect(block.result).not.toContain('"workflow_state"');
      expect(block.result).not.toMatch(/^\s*Retained typed workflow state:/);
    }
  });

  it('drops a result body that is only display-only structured state', () => {
    // analysis / visualization / synthesis carry a bare workflow-state blob as
    // their output_summary — that is display-only, so the prose result is empty.
    const synthesis = model.blocks.find((b) => b.agent === 'synthesis')!;
    expect(synthesis.task).toContain('Compose the final');
    expect(synthesis.result).toBe('');
  });

  it('exposes the final text answer as a prominent markdown body', () => {
    expect(model.answer).toContain('Region');
    expect(model.answer).toContain('Station');
  });
});

describe('reconcileTurnModel — streaming identity stability (perf)', () => {
  function handoff(agent: string, question: string, summary: string): Part {
    return {
      type: 'expert_handoff',
      id: `p-${agent}`,
      metadata: {
        delegate_to: agent,
        parent_id: 'main',
        status: 'completed',
        question,
        output_summary: summary,
      },
      text: summary,
    } as unknown as Part;
  }

  it('reuses the object reference of an UNCHANGED block across a rebuild', () => {
    const partsA = [handoff('geospatial', 'q1', 'done one'), handoff('data', 'q2', 'done two')];
    const a = buildAssistantTurnModel(partsA)!;

    const partsB = [
      handoff('geospatial', 'q1', 'done one'),
      handoff('data', 'q2', 'done two — now with more streamed text'),
    ];
    const b = reconcileTurnModel(a, buildAssistantTurnModel(partsB)!);

    expect(b.blocks[0]).toBe(a.blocks[0]);
    expect(b.blocks[1]).not.toBe(a.blocks[1]);
    expect(b.blocks[1]!.result).toContain('more streamed text');
  });

  it('reuses unchanged tool-call references inside a streaming block', () => {
    const withTools = (extra: string): Part =>
      ({
        type: 'expert_handoff',
        id: 'p-data',
        metadata: {
          delegate_to: 'data',
          parent_id: 'main',
          status: 'completed',
          question: 'q',
          output_summary: 'prose',
          tools_called: [
            { call_id: 'c1', name: 'tool_a', args: { x: 1 }, ok: true, result: 'A result' },
            { call_id: 'c2', name: 'tool_b', args: { y: 2 }, ok: true, result: `B result${extra}` },
          ],
        },
        text: 'summary',
      }) as unknown as Part;

    const a = buildAssistantTurnModel([withTools('')])!;
    const b = reconcileTurnModel(a, buildAssistantTurnModel([withTools(' grown')])!);

    expect(b.blocks[0]!.tools[0]).toBe(a.blocks[0]!.tools[0]);
    expect(b.blocks[0]!.tools[1]).not.toBe(a.blocks[0]!.tools[1]);
  });

  it('passes the next model through unchanged when there is no previous', () => {
    const next = buildAssistantTurnModel([handoff('geospatial', 'q', 's')])!;
    expect(reconcileTurnModel(null, next)).toBe(next);
  });
});

describe('buildAssistantTurnModel — depth from metadata when it varies', () => {
  function handoff(id: string, agent: string, parent: string, depth: number): Part {
    return {
      type: 'expert_handoff',
      id,
      metadata: { agent_id: agent, parent_id: parent, depth, question: 'q', output_summary: 'p' },
    } as unknown as Part;
  }

  it('uses metadata.depth directly when the turn carries differing depths', () => {
    const model = buildAssistantTurnModel([
      handoff('a', 'data', 'main', 1),
      handoff('b', 'child', 'data', 2),
    ])!;
    expect(model.blocks.map((b) => b.depth)).toEqual([1, 2]);
  });

  it('walks the parent_id chain when depth is uniform/absent', () => {
    const model = buildAssistantTurnModel([
      { type: 'expert_handoff', id: 'a', metadata: { agent_id: 'data', parent_id: 'main', question: 'q', output_summary: 'p' } } as unknown as Part,
      { type: 'expert_handoff', id: 'b', metadata: { agent_id: 'child', parent_id: 'data', question: 'q', output_summary: 'p' } } as unknown as Part,
    ])!;
    expect(model.blocks[0]!.depth).toBe(1);
    expect(model.blocks[1]!.depth).toBe(2);
  });
});

describe('buildAssistantTurnModel — non-delegation turns', () => {
  it('returns null when there are no handoffs (keeps the simple flat render)', () => {
    expect(
      buildAssistantTurnModel([{ type: 'text', text: 'just an answer' } as Part]),
    ).toBeNull();
  });
});
