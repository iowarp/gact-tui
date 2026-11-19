import { describe, expect, it } from 'vitest';
import { vocab } from './brand-vocabulary';
import { agentScopeHeading } from './settings-agent-name';

describe('agentScopeHeading', () => {
  it('says a bare connection label is the agent', () => {
    expect(agentScopeHeading('cloud', 'cloud')).toBe(`${vocab.agent}: cloud`);
  });

  it('keeps a name that already names the agent', () => {
    expect(agentScopeHeading(`${vocab.agent} lab`, `${vocab.agent} lab`)).toBe(
      `${vocab.agent} lab`,
    );
    expect(agentScopeHeading('Helper local')).toBe('Helper local');
  });
});
