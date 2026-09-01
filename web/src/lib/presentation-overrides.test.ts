import { describe, expect, it, vi } from 'vitest';
import { PRESENTATION_OVERRIDE_REGISTRY } from './presentation-override-registry';
import {
  getPresentationOverrideCount,
  reportPresentationOverride,
  subscribePresentationOverrides,
} from './presentation-overrides';

describe('presentation override ledger', () => {
  it('deduplicates rerenders by override kind and entity within a session', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const input = {
      kind: 'child-assignment-fallback' as const,
      entityId: 'task_ledger',
      sessionId: 'sess_override_ledger',
      serverValue: undefined,
      rendered: 'Delegated work',
      issue: PRESENTATION_OVERRIDE_REGISTRY['child-assignment-fallback'].issue,
    };

    reportPresentationOverride(input);
    reportPresentationOverride(input);

    expect(getPresentationOverrideCount('sess_override_ledger')).toBe(1);
    warn.mockRestore();
  });

  it('notifies observers after recording a new override', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribePresentationOverrides(listener);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    reportPresentationOverride({
      kind: 'child-assignment-fallback',
      entityId: 'task_1',
      sessionId: 'sess_override_notify',
      serverValue: undefined,
      rendered: 'Delegated work',
      issue: PRESENTATION_OVERRIDE_REGISTRY['child-assignment-fallback'].issue,
    });
    await Promise.resolve();

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    warn.mockRestore();
  });

  it('keeps an override with no owning session out of the focused session bucket', () => {
    window.history.replaceState({}, '', '/workspaces/ws_1/sessions/sess_override_scope');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    reportPresentationOverride({
      kind: 'tool-name-humanization',
      entityId: 'relay',
      serverValue: 'relay',
      rendered: 'Relay',
      issue: PRESENTATION_OVERRIDE_REGISTRY['tool-name-humanization'].issue,
    });

    expect(getPresentationOverrideCount('sess_override_scope')).toBe(0);
    warn.mockRestore();
  });
});
