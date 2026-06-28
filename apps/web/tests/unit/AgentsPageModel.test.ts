import type { AgentDef } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  filterAgents,
  sortAgentsByTier,
} from '../../src/routes/discovery/AgentsPageModel.js';

const agents = [
  {
    id: 'data',
    title: 'Data Expert',
    description: 'Stages catalog files and time-series data.',
    keywords: ['ndp', 'earthscope'],
    tier: 2,
  },
  {
    id: 'main',
    title: 'Main Orchestrator',
    description: 'Routes work to specialists.',
    keywords: ['routing'],
    tier: 1,
  },
  {
    id: 'utility',
    title: 'Utility',
  },
] as unknown as AgentDef[];

describe('AgentsPageModel', () => {
  it('returns the original agent list for an empty query', () => {
    expect(filterAgents(agents, '   ')).toBe(agents);
  });

  it('matches agents by id', () => {
    expect(filterAgents(agents, 'util')).toEqual([agents[2]]);
  });

  it('matches agents by title case-insensitively', () => {
    expect(filterAgents(agents, 'MAIN')).toEqual([agents[1]]);
  });

  it('matches agents by description', () => {
    expect(filterAgents(agents, 'catalog')).toEqual([agents[0]]);
  });

  it('matches agents by keyword', () => {
    expect(filterAgents(agents, 'earthscope')).toEqual([agents[0]]);
  });

  it('sorts lower tiers first and leaves untiered agents last', () => {
    expect(sortAgentsByTier(agents).map((agent) => agent.id)).toEqual([
      'main',
      'data',
      'utility',
    ]);
  });
});
