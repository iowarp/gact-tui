import { describe, expect, it } from 'vitest';
import { providerActionStageFlow, providerActionStageWord } from './provider-action-flows';

describe('provider action flows', () => {
  it('names a running stage by its step for the provider row', () => {
    expect(providerActionStageWord('Verifying GitHub Copilot…')).toBe('Verifying…');
    expect(providerActionStageWord('Loading models…')).toBe('Loading models…');
    expect(providerActionStageWord('Waiting for you to log in…')).toBe('Logging in…');
    expect(providerActionStageWord('Checking…')).toBe('Checking…');
    expect(providerActionStageWord('Saving your key…')).toBe('Saving your key…');
    expect(providerActionStageWord('Logging out…')).toBe('Logging out…');
  });

  it('keeps a sign-in on its own steps once the provider reports signed in', () => {
    expect(providerActionStageFlow('check', 'Verifying GitHub Copilot…')).toBe('sign_in');
    expect(providerActionStageFlow('check', 'Loading models…')).toBe('sign_in');
    expect(providerActionStageFlow('check', 'Checking…')).toBe('check');
  });
});
