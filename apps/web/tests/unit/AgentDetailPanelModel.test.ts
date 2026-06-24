import type { AgentDef } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  agentDetailViewModel,
  type AgentDetail,
} from '../../src/routes/discovery/AgentDetailPanelModel.js';

const agent = {
  id: 'main',
  title: 'Main',
  tier: 1,
  tools: ['delegate'],
  keywords: ['root'],
} as AgentDef;

describe('AgentDetailPanelModel', () => {
  it('builds scannable facts from detailed agent metadata', () => {
    const detail = {
      id: 'main',
      title: 'Main',
      source: 'builtin',
      tier: 2,
      specialization: 'workflow routing',
      default_model: 'gpt-oss-120b',
      tools: ['delegate', 'summarize', 'delegate', ''],
      keywords: ['main', 'routing'],
      routing_rules: {
        data_agent: 'delegate data',
        analysis: ['review', 'plot'],
      },
      metadata: {
        owner: 'bench',
        enabled: true,
        nested: { retained: true },
        empty: null,
      },
    } as unknown as AgentDetail;

    expect(agentDetailViewModel(agent, detail)).toEqual({
      source: 'builtin',
      tier: 'tier 2',
      focus: 'workflow routing',
      model: 'gpt-oss-120b',
      tools: ['delegate', 'summarize'],
      keywords: ['#main', '#routing'],
      routing: [
        ['Data Agent', 'delegate data'],
        ['Analysis', 'review, plot'],
      ],
      metadata: [
        ['Owner', 'bench'],
        ['Enabled', 'true'],
        ['Nested', '1 field'],
      ],
    });
  });

  it('falls back to base agent fields and concise placeholders', () => {
    const detail = {
      id: 'main',
      title: 'Main',
      provider_id: 'alcf',
      delegation: {
        many: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        none: [],
        nil: undefined,
      },
      metadata: {},
    } as unknown as AgentDetail;

    expect(agentDetailViewModel(agent, detail)).toEqual({
      source: 'backend',
      tier: 'tier 1',
      focus: undefined,
      model: 'alcf',
      tools: ['delegate'],
      keywords: ['#root'],
      routing: [
        ['Many', '7 items'],
        ['None', ''],
      ],
      metadata: [],
    });
  });

  it('reports unconfigured detail when no tier or model is known', () => {
    const untiered = { id: 'utility', title: 'Utility' } as AgentDef;
    const detail = { id: 'utility', title: 'Utility' } as AgentDetail;
    expect(agentDetailViewModel(untiered, detail)).toMatchObject({
      source: 'backend',
      tier: 'unreported',
      model: undefined,
      tools: [],
      keywords: [],
      routing: [],
      metadata: [],
    });
  });
});
