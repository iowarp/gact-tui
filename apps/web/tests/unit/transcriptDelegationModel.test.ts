import { describe, expect, it } from 'vitest';
import type { Message, Part } from '@clio/core';
import {
  buildAssistantTurnModel,
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

  it('DEDUPEs the 10 handoffs (5 delegations x2) down to 5 steps', () => {
    expect(model.steps).toHaveLength(5);
    expect(model.steps.map((s) => s.agent)).toEqual([
      'geospatial',
      'data',
      'analysis',
      'visualization',
      'synthesis',
    ]);
  });

  it('places every named expert at delegation depth 1 under main', () => {
    for (const step of model.steps) {
      expect(step.depth).toBe(1);
      expect(step.parent).toBe('main');
    }
  });

  it('STRIPs all workflow-state scaffolding from every step', () => {
    for (const step of model.steps) {
      expect(step.text).not.toContain('Retained typed workflow state');
      expect(step.text).not.toContain('CLIO durable typed workflow state');
      expect(step.text).not.toContain('"workflow_state"');
      expect(step.text).not.toMatch(/delegate\.completed|parent\.resumed/);
      expect(step.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps the real prose for each step', () => {
    const geospatial = model.steps[0]!;
    expect(geospatial.text).toContain('Los Angeles');
    const data = model.steps[1]!;
    expect(data.text).toContain('EarthScope GNSS Data Acquisition');
  });

  it('exposes the final text answer as a prominent markdown body', () => {
    expect(model.answer).toContain('EarthScope GNSS Ground Motion');
    expect(model.answer).not.toContain('workflow_state');
  });

  it('keeps the routing decision out of the steps flow', () => {
    expect(model.steps.every((s) => s.agent !== 'chat')).toBe(true);
  });
});

describe('buildAssistantTurnModel — non-delegation turns', () => {
  it('returns null when there are no handoffs (keeps the simple flat render)', () => {
    expect(
      buildAssistantTurnModel([{ type: 'text', text: 'just an answer' } as Part]),
    ).toBeNull();
  });
});
