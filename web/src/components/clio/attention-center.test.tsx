import type { Session } from '@clio/core/v3';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playAttentionSound } from '@/lib/attention-sound';
import type { SessionAttention } from '@/lib/session-attention';
import { NotificationPreferencesProvider } from '@/providers/notification-preferences-provider';
import { ClioAttentionNotifier } from './attention-center';

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }));
vi.mock('@/lib/attention-sound', () => ({ playAttentionSound: vi.fn(async () => true) }));

const baseSession: Session = {
  id: 'sess_1',
  workspace_id: 'ws_1',
  title: 'Session One',
  state: 'waiting_user',
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
};
function waitingAttention(sessionId: string): SessionAttention {
  return {
    sessionId,
    permissionIds: [],
    questionIds: [`state:${sessionId}:waiting_user`],
    mcpTaskInputIds: [],
    a2uiIds: [],
    unknownIds: [],
    total: 1,
  };
}

function Notifier(props: {
  activeSessionId: string;
  attentions: Record<string, SessionAttention>;
  sessions: Session[];
}) {
  return (
    <MemoryRouter>
      <NotificationPreferencesProvider>
        <ClioAttentionNotifier {...props} />
      </NotificationPreferencesProvider>
    </MemoryRouter>
  );
}

describe('ClioAttentionNotifier', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(toast.warning).mockClear();
    vi.mocked(playAttentionSound).mockClear();
    vi.mocked(playAttentionSound).mockResolvedValue(true);
  });
  afterEach(cleanup);

  it('re-alerts a repeat of the same synthetic marker once the earlier one cleared', async () => {
    const session: Session = { ...baseSession, id: 'sess_repeat' };
    const { rerender } = render(
      <Notifier
        activeSessionId="other"
        attentions={{ [session.id]: waitingAttention(session.id) }}
        sessions={[session]}
      />,
    );
    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));

    // The question is answered: attention clears entirely.
    rerender(<Notifier activeSessionId="other" attentions={{}} sessions={[session]} />);

    // A LATER question raises the identical synthetic marker again.
    rerender(
      <Notifier
        activeSessionId="other"
        attentions={{ [session.id]: waitingAttention(session.id) }}
        sessions={[session]}
      />,
    );

    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(2));
  });

  it('does not toast for the session already open, but does for a background one', async () => {
    const activeSession: Session = { ...baseSession, id: 'sess_active' };
    const { rerender } = render(
      <Notifier
        activeSessionId="sess_active"
        attentions={{ [activeSession.id]: waitingAttention(activeSession.id) }}
        sessions={[activeSession]}
      />,
    );

    // Give the effect a tick to run, then confirm no toast fired for the
    // session the reader is already looking at.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(toast.warning).not.toHaveBeenCalled();

    const backgroundSession: Session = { ...baseSession, id: 'sess_background' };
    rerender(
      <Notifier
        activeSessionId="sess_active"
        attentions={{ [backgroundSession.id]: waitingAttention(backgroundSession.id) }}
        sessions={[activeSession, backgroundSession]}
      />,
    );

    await waitFor(() => expect(toast.warning).toHaveBeenCalledTimes(1));
  });

  it('skips an archived session the bell would not show either', async () => {
    const archivedSession: Session = { ...baseSession, id: 'sess_archived', archived: true };
    render(
      <Notifier
        activeSessionId="other"
        attentions={{ [archivedSession.id]: waitingAttention(archivedSession.id) }}
        sessions={[archivedSession]}
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('surfaces a muted attention sound at least once per preference change', async () => {
    window.localStorage.setItem(
      'clio.notifications.v1',
      JSON.stringify({ attentionSound: 'always', desktopNotifications: false }),
    );
    vi.mocked(playAttentionSound).mockResolvedValue(false);
    const session: Session = { ...baseSession, id: 'sess_muted' };

    render(
      <Notifier
        activeSessionId="other"
        attentions={{ [session.id]: waitingAttention(session.id) }}
        sessions={[session]}
      />,
    );

    await waitFor(() =>
      expect(
        vi.mocked(toast.warning).mock.calls.some(([title]) => title !== 'Response needed'),
      ).toBe(true),
    );
  });
});
