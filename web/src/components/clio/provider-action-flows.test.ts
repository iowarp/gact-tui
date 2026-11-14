import { describe, expect, it } from 'vitest';
import { providerActionStageFlow, providerActionStageWord } from './provider-action-flows';

describe('provider action flows', () => {
  it('names a running stage by its step for the provider row', () => {
    expect(providerActionStageWord('verifying:GitHub Copilot')).toBe('Verifying…');
    expect(providerActionStageWord('loading-models')).toBe('Loading models…');
    expect(providerActionStageWord('sign-in-waiting')).toBe('Logging in…');
    expect(providerActionStageWord('checking')).toBe('Checking…');
    expect(providerActionStageWord('install-waiting')).toBe('Waiting to install…');
    expect(providerActionStageWord('installing')).toBe('Installing…');
    expect(providerActionStageWord('key-saving')).toBe('Saving your key…');
    expect(providerActionStageWord('logging-out')).toBe('Logging out…');
  });

  it('keeps a sign-in on its own steps once the provider reports signed in', () => {
    expect(providerActionStageFlow('check', 'verifying:GitHub Copilot')).toBe('sign_in');
    expect(providerActionStageFlow('check', 'loading-models')).toBe('sign_in');
    expect(providerActionStageFlow('check', 'checking')).toBe('check');
  });
});
