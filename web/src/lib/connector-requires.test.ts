import { agentNeedItemSchema, connectorSchema } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { agentNeedEffect } from '@/lib/agent-needs';
import { connectorSetupWords } from '@/lib/connector-plugin';

const requires = 'Needs the fixture program installed on this machine.';

const kitConnector = (value: Record<string, unknown> = {}) =>
  connectorSchema.parse({
    id: 'fixture-kit',
    name: 'Fixture kit',
    description: 'Runs the fixture program installed here.',
    logo_url: null,
    source: 'catalog',
    enabled: false,
    tool_count: null,
    state: { status: 'ready', needs: [], reason: null },
    needs: [],
    kit: 'fixture-kit',
    requires,
    ...value,
  });

describe('what must already be on this machine (SL-D8)', () => {
  it('follows the setup words on a connector that is off, and goes once it is on', () => {
    expect(connectorSetupWords(kitConnector())).toBe(
      `Downloads its tools when you enable it. ${requires}`,
    );
    expect(connectorSetupWords(kitConnector({ kit: null }))).toBe(requires);
    expect(connectorSetupWords(kitConnector({ enabled: true }))).toBe('');
    expect(connectorSetupWords(kitConnector({ requires: null }))).toBe(
      'Downloads its tools when you enable it',
    );
  });

  it('ends what enabling an agent need does', () => {
    const item = agentNeedItemSchema.parse({
      id: 'fixture-kit',
      connector_id: 'fixture-kit',
      name: 'Fixture kit',
      reasons: ['off', 'download'],
      download: true,
      requires,
    });
    expect(agentNeedEffect(item)).toBe(`downloads its tools. ${requires}`);
    expect(agentNeedEffect({ ...item, requires: undefined })).toBe('downloads its tools');
  });
});
