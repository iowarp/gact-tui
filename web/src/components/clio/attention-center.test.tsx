import type { Session } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playAttentionSound } from '@/lib/attention-sound';
import type { SessionAttention } from '@/lib/session-attention';
import { NotificationPreferencesProvider } from '@/providers/notification-preferences-provider';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioAttentionCenter, ClioAttentionNotifier } from './attention-center';

vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), warning: vi.fn() } }));
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

describe('ClioAttentionCenter', () => {
  afterEach(cleanup);

  function Center(props: { attentions: Record<string, SessionAttention>; sessions: Session[] }) {
    return (
      <MemoryRouter>
        <TooltipProvider>
          <SidebarProvider>
            <ClioAttentionCenter activeSessionId="sess_1" {...props} />
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>
    );
  }

  it('renders nothing when no session needs a response', () => {
    render(<Center attentions={{}} sessions={[baseSession]} />);
    expect(screen.queryByRole('button', { name: /need.* your response/ })).toBeNull();
  });

  it('lists waiting sessions with their pending work and opens with its shortcut', async () => {
    const second: Session = { ...baseSession, id: 'sess_2', title: 'Session Two' };
    render(
      <Center
        attentions={{
          sess_1: waitingAttention('sess_1'),
          sess_2: {
            ...waitingAttention('sess_2'),
            permissionIds: ['perm_1', 'perm_2'],
            total: 3,
          },
        }}
        sessions={[baseSession, second]}
      />,
    );
    const trigger = screen.getByRole('button', {
      name: /2 sessions need your response; 4 responses pending/,
    });
    expect(trigger).toHaveAttribute('aria-keyshortcuts');
    fireEvent.keyDown(window, { key: 'n', code: 'KeyN', ctrlKey: true, altKey: true });
    const dialog = await screen.findByRole('dialog');
    // The badge, the trigger's name and the group all count responses, so they agree.
    expect(within(dialog).getByRole('heading', { name: /Needs you\s*4/ })).toBeInTheDocument();
    const second_row = within(dialog).getByRole('link', {
      name: 'Session Two: 2 approvals, 1 question',
    });
    expect(second_row).toHaveAttribute('href', '/workspaces/ws_1/sessions/sess_2');
    // The first pending kind names the row's action.
    expect(within(second_row).getByText('Review')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Session One: 1 question' }),
    ).toBeInTheDocument();
  });
});
