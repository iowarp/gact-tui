import type { PendingInteraction, Session } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { playAttentionSound } from '@/lib/attention-sound';
import type { SessionAttention } from '@/lib/session-attention';
import { NotificationPreferencesProvider } from '@/providers/notification-preferences-provider';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioAttentionCenter, ClioAttentionNotifier } from './attention-center';

vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/lib/attention-sound', () => ({ playAttentionSound: vi.fn(async () => true) }));
const respond = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
vi.mock('@/hooks/use-attention-response', () => ({ useAttentionResponse: () => respond }));
vi.mock('@/hooks/use-system-version-status', () => ({
  useSystemVersionStatus: () => ({ state: 'current', desktopShell: false, updating: false }),
}));

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

  describe('finished work', () => {
    const notices: { title: string; options?: NotificationOptions }[] = [];
    let hasFocus: MockInstance<() => boolean>;
    beforeEach(() => {
      notices.length = 0;
      vi.stubGlobal(
        'Notification',
        Object.assign(
          function Notification(title: string, options?: NotificationOptions) {
            notices.push({ title, options });
            return { addEventListener: vi.fn(), close: vi.fn() };
          },
          { permission: 'granted' },
        ),
      );
      hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      hasFocus.mockRestore();
    });

    function runTo(finishedWork: string, from: Session['state'], to: Session['state']) {
      window.localStorage.setItem('clio.notifications.v1', JSON.stringify({ finishedWork }));
      const session: Session = { ...baseSession, id: 'sess_run', state: from };
      const { rerender } = render(
        <Notifier activeSessionId="other" attentions={{}} sessions={[session]} />,
      );
      rerender(
        <Notifier
          activeSessionId="other"
          attentions={{}}
          sessions={[{ ...session, state: to }]}
        />,
      );
    }

    it('alerts on the desktop when a background run finishes or stops', async () => {
      runTo('desktop', 'running', 'completed');
      await waitFor(() => expect(notices.map((notice) => notice.title)).toEqual(['Session One finished']));
      cleanup();
      runTo('desktop', 'running', 'failed');
      await waitFor(() =>
        expect(notices.map((notice) => notice.title)).toEqual([
          'Session One finished',
          'Session One stopped',
        ]),
      );
    });

    it('stays in the bell by default and says nothing for a run you cancelled', async () => {
      runTo('bell', 'running', 'completed');
      cleanup();
      runTo('desktop', 'running', 'cancelled');
      cleanup();
      runTo('desktop', 'completed', 'completed');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(notices).toEqual([]);
    });

    it('says nothing while the app has focus', async () => {
      hasFocus.mockReturnValue(true);
      runTo('desktop', 'running', 'completed');
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(notices).toEqual([]);
    });
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

  it('keeps the bell with no badge when nothing needs a response', async () => {
    render(<Center attentions={{}} sessions={[baseSession]} />);
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(within(bell).queryByText(/\d/)).toBeNull();
    fireEvent.click(bell);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Nothing needs you.')).toBeInTheDocument();
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
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
      name: 'Session Two wants approval: 2 approvals, 1 question',
    });
    expect(second_row).toHaveAttribute('href', '/workspaces/ws_1/sessions/sess_2');
    // A conversation with no request records yet keeps one summary row; its first kind names the action.
    expect(within(second_row).getByText('Review')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Session One asked a question: 1 question' }),
    ).toBeInTheDocument();
    // Opening starts on the first notification, so arrows move through the list.
    await waitFor(() => expect(within(dialog).getAllByRole('link')[0]).toHaveFocus());
  });

  it('gives each pending request its own row and decides a command in place', async () => {
    const command: PendingInteraction = {
      id: 'perm_1',
      kind: 'permission',
      owner_session_id: 'sess_1',
      attended_session_id: 'sess_1',
      status: 'pending',
      title: 'Run a command',
      source: { protocol: 'native', tool_name: 'bash' },
      created_at: '2026-09-01T00:01:00Z',
      payload: {
        permission_id: 'perm_1',
        tool_call: { tool_name: 'bash', input: { command: 'sbatch --nodes 4 align_grids.sh' } },
        execution: { computer: 'ares', cwd: '/home/lab' },
      },
      actions: ['allow', 'deny', 'allow_session'],
    };
    const question: PendingInteraction = {
      ...command,
      id: 'question_1',
      kind: 'question',
      title: 'Question from agent',
      prompt: 'Which baseline years should the comparison use?',
      created_at: '2026-09-01T00:02:00Z',
      payload: { question_id: 'question_1' },
      actions: ['answer', 'cancel'],
    };
    render(
      <Center
        attentions={{
          sess_1: {
            sessionId: 'sess_1',
            permissionIds: ['perm_1'],
            questionIds: ['question_1'],
            mcpTaskInputIds: [],
            a2uiIds: [],
            unknownIds: [],
            requests: [command, question],
            total: 2,
          },
        }}
        sessions={[baseSession]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /needs your response/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('link', {
        name: 'Session One wants to run a command: sbatch --nodes 4 align_grids.sh on ares',
      }),
    ).toBeInTheDocument();
    const answer = within(dialog).getByRole('link', {
      name: 'Session One asked a question: Which baseline years should the comparison use?',
    });
    expect(within(answer).getByText('Answer')).toBeInTheDocument();
    // Only the permission is decided in place; the question opens its conversation.
    const decide = within(dialog).getByRole('group', { name: /wants to run a command/ });
    expect(within(dialog).getAllByRole('group')).toHaveLength(1);
    fireEvent.click(within(decide).getByRole('button', { name: 'Allow' }));
    expect(respond.mutate).toHaveBeenCalledWith(
      { interaction: command, action: 'allow' },
      expect.anything(),
    );
    fireEvent.click(within(decide).getByRole('button', { name: 'Deny' }));
    expect(respond.mutate).toHaveBeenLastCalledWith(
      { interaction: command, action: 'deny' },
      expect.anything(),
    );
  });
});
