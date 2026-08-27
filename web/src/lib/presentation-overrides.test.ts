import { describe, expect, it, vi } from 'vitest';
import { PRESENTATION_OVERRIDE_REGISTRY } from './presentation-override-registry';
import {
  getPresentationOverrideCount,
  reportPresentationOverride,
  subscribePresentationOverrides,
} from './presentation-overrides';

describe('presentation override ledger', () => {
  it('deduplicates rerenders by override kind and entity within a session', () => {
    window.history.replaceState({}, '', '/workspaces/ws_1/sessions/sess_override_ledger');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const input = {
      kind: 'tool-name-humanization' as const,
      entityId: 'fs_read_file',
      serverValue: 'fs_read_file',
      rendered: 'Read file',
      issue: PRESENTATION_OVERRIDE_REGISTRY['tool-name-humanization'].issue,
    };

    reportPresentationOverride(input);
    reportPresentationOverride(input);

    expect(getPresentationOverrideCount('sess_override_ledger')).toBe(1);
    warn.mockRestore();
  });

  it('notifies observers after recording a new override', async () => {
    window.history.replaceState({}, '', '/workspaces/ws_1/sessions/sess_override_notify');
    const listener = vi.fn();
    const unsubscribe = subscribePresentationOverrides(listener);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    reportPresentationOverride({
      kind: 'child-assignment-fallback',
      entityId: 'task_1',
      serverValue: undefined,
      rendered: 'Delegated work',
      issue: PRESENTATION_OVERRIDE_REGISTRY['child-assignment-fallback'].issue,
    });
    await Promise.resolve();

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    warn.mockRestore();
  });
});
