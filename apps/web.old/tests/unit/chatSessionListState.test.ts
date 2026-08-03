import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createChatSessionListState } from '../../src/routes/chatSessionListState.js';

/**
 * Regression for the "new session opens as a second, prompt-named session I can't
 * see" bug. Creating a session sets `activeId` to the new id and kicks a refetch;
 * until that refetch lands, the new id is absent from the sessions list. The
 * stale-id recovery effect must NOT clear `activeId` in that window (guarded by
 * `sessionsLoading`), otherwise the composer sends into an empty active id and a
 * second session titled from the prompt is created instead.
 */
const tick = () => new Promise((r) => setTimeout(r, 0));

function harness(initial: {
  sessions: Array<{ id: string; title: string }>;
  activeId: string;
  loading: boolean;
}) {
  return createRoot((dispose) => {
    const [sessions, setSessions] = createSignal(initial.sessions);
    const [loading, setLoading] = createSignal(initial.loading);
    const [activeId, setActiveId] = createSignal(initial.activeId);
    createChatSessionListState({
      backendUrl: 'http://x',
      sessions: () =>
        sessions().map((s) => ({
          id: s.id,
          title: s.title,
          status: 'idle' as const,
          updatedAt: '2026-01-01',
        })),
      sessionsLoading: loading,
      activeId,
      setActiveId,
      patchSessionMetadata: async () => undefined,
      toastPush: () => 0,
    });
    return { activeId, setSessions, setLoading, setActiveId, dispose };
  });
}

describe('chatSessionListState stale-id recovery', () => {
  it('does NOT clear a just-created activeId while the list is still refetching', async () => {
    const h = harness({ sessions: [{ id: 'A', title: 'A' }], activeId: 'B', loading: true });
    await tick();
    // B is absent from the list but the refetch is in flight — keep it.
    expect(h.activeId()).toBe('B');
    // Refetch lands with B present -> still selected.
    h.setSessions([
      { id: 'A', title: 'A' },
      { id: 'B', title: 'B' },
    ]);
    h.setLoading(false);
    await tick();
    expect(h.activeId()).toBe('B');
    h.dispose();
  });

  it('clears a genuinely stale activeId once the list has settled (not loading)', async () => {
    const h = harness({ sessions: [{ id: 'A', title: 'A' }], activeId: 'ghost', loading: false });
    await tick();
    expect(h.activeId()).toBe('');
    h.dispose();
  });
});
