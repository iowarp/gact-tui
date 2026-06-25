import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@clio/core';
import {
  buildAssistantTurnModel,
  reconcileTurnModel,
  stripControlScaffolding,
} from '../../src/components/transcriptDelegationModel.js';
import earthscopeRealTrace from '../visual/fixtures/earthscope-real-trace.json' with { type: 'json' };

const realAssistant = (earthscopeRealTrace as { messages: Message[] }).messages.find(
  (m) => m.role === 'assistant',
)!;

describe('stripControlScaffolding', () => {
  it('removes the "agent -> agent | status | stage | " status prefix', () => {
    const out = stripControlScaffolding(
      'main -> data | completed | delegate.completed | Real prose here.',
    );
    expect(out).toBe('Real prose here.');
  });

  it('removes the parent.resumed status prefix', () => {
    const out = stripControlScaffolding('main | completed | parent.resumed | Real prose.');
    expect(out).toBe('Real prose.');
  });

  it('cuts the "Retained typed workflow state:" scaffolding and its JSON blob', () => {
    const out = stripControlScaffolding(
      'Useful summary.\n\nRetained typed workflow state:\n{"workflow_state": {"a": 1}}',
    );
    expect(out).toBe('Useful summary.');
    expect(out).not.toContain('workflow_state');
  });

  it('cuts the "CLIO durable typed workflow state:" trailer', () => {
    const out = stripControlScaffolding('Answer body.\n\nCLIO durable typed workflow state:');
    expect(out).toBe('Answer body.');
  });

  it('does not eat pipes inside markdown tables', () => {
    const md = '## Heading\n\n| A | B |\n| - | - |\n| 1 | 2 |';
    expect(stripControlScaffolding(md)).toBe(md);
  });

  it('returns empty for empty input', () => {
    expect(stripControlScaffolding('')).toBe('');
    expect(stripControlScaffolding('   ')).toBe('');
  });
});

describe('buildAssistantTurnModel — real earthscope trace', () => {
  const model = buildAssistantTurnModel(realAssistant.parts as Part[])!;

  it('returns a model for a turn carrying handoffs', () => {
    expect(model).not.toBeNull();
  });

  it('DEDUPEs the 10 handoffs (5 delegations x2) down to 5 blocks', () => {
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

  it('places every named expert at delegation depth 1 under main', () => {
    for (const block of model.blocks) {
      expect(block.depth).toBe(1);
      expect(block.parent).toBe('main');
    }
  });

  it('SURFACES the task main actually sent to each expert (meta.question)', () => {
    const geospatial = model.blocks[0]!;
    expect(geospatial.task).toContain('Resolve "Los Angeles"');
    expect(geospatial.task).toContain('geocode');
    const data = model.blocks[1]!;
    expect(data.task).toContain('Discover EarthScope/NDP GNSS stations');
  });

  it('exposes each expert tool call + result, in order', () => {
    const geospatial = model.blocks[0]!;
    expect(geospatial.tools).toHaveLength(1);
    expect(geospatial.tools[0]!.name).toBe('geo_geocode');
    expect(geospatial.tools[0]!.argsSummary).toContain('Los Angeles');
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

  it('gives every tool call a stable, unique id', () => {
    const data = model.blocks[1]!;
    const ids = data.tools.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('STRIPs all workflow-state scaffolding from every block result', () => {
    for (const block of model.blocks) {
      expect(block.result).not.toContain('Retained typed workflow state');
      expect(block.result).not.toContain('CLIO durable typed workflow state');
      expect(block.result).not.toContain('"workflow_state"');
      expect(block.result).not.toMatch(/delegate\.completed|parent\.resumed/);
      expect(block.result.trim().length).toBeGreaterThan(0);
    }
  });

  it('renders the expert result as markdown prose, not scaffolding', () => {
    const geospatial = model.blocks[0]!;
    expect(geospatial.result).toContain('Los Angeles');
    const data = model.blocks[1]!;
    expect(data.result).toContain('EarthScope GNSS Data Acquisition');
  });

  it('exposes the final text answer as a prominent markdown body', () => {
    expect(model.answer).toContain('EarthScope GNSS Ground Motion');
    expect(model.answer).not.toContain('workflow_state');
  });

  it('keeps the routing decision out of the blocks flow', () => {
    expect(model.blocks.every((b) => b.agent !== 'chat')).toBe(true);
  });
});

describe('reconcileTurnModel — streaming identity stability (perf)', () => {
  function handoff(agent: string, question: string, summary: string): Part {
    return {
      type: 'expert_handoff',
      id: `p-${agent}`,
      metadata: { delegate_to: agent, parent_id: 'main', status: 'completed', question },
      text: summary,
    } as unknown as Part;
  }

  it('reuses the object reference of an UNCHANGED block across a rebuild', () => {
    const partsA = [handoff('geospatial', 'q1', 'done one'), handoff('data', 'q2', 'done two')];
    const a = buildAssistantTurnModel(partsA)!;

    // A later delta extends only the SECOND block's result; the first is identical.
    const partsB = [
      handoff('geospatial', 'q1', 'done one'),
      handoff('data', 'q2', 'done two — now with more streamed text'),
    ];
    const b = reconcileTurnModel(a, buildAssistantTurnModel(partsB)!);

    // Unchanged first block keeps its identity → <For> skips it.
    expect(b.blocks[0]).toBe(a.blocks[0]);
    // Changed second block gets a fresh reference → <For> re-renders just it.
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
          tools_called: [
            { call_id: 'c1', name: 'tool_a', args: { x: 1 }, ok: true, result: 'A result' },
            { call_id: 'c2', name: 'tool_b', args: { y: 2 }, ok: true, result: `B result${extra}` },
          ],
        },
        text: 'summary',
      }) as unknown as Part;

    const a = buildAssistantTurnModel([withTools('')])!;
    const b = reconcileTurnModel(a, buildAssistantTurnModel([withTools(' grown')])!);

    // First tool unchanged → same reference; second tool changed → new reference.
    expect(b.blocks[0]!.tools[0]).toBe(a.blocks[0]!.tools[0]);
    expect(b.blocks[0]!.tools[1]).not.toBe(a.blocks[0]!.tools[1]);
  });

  it('passes the next model through unchanged when there is no previous', () => {
    const next = buildAssistantTurnModel([handoff('geospatial', 'q', 's')])!;
    expect(reconcileTurnModel(null, next)).toBe(next);
  });
});

describe('buildAssistantTurnModel — non-delegation turns', () => {
  it('returns null when there are no handoffs (keeps the simple flat render)', () => {
    expect(
      buildAssistantTurnModel([{ type: 'text', text: 'just an answer' } as Part]),
    ).toBeNull();
  });
});
