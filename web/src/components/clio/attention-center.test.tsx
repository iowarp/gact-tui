import type { PendingInteraction, Session, Workspace } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { playAttentionSound } from '@/lib/attention-sound';
import {
  NOTIFICATION_READS_STORAGE_KEY,
  resetNotificationReadsForTest,
} from '@/lib/notification-reads';
import type { SessionAttention } from '@/lib/session-attention';
import { NotificationPreferencesProvider } from '@/providers/notification-preferences-provider';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ClioAttentionCenter, ClioAttentionNotifier } from './attention-center';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { dismiss: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}));
vi.mock('@/lib/attention-sound', () => ({ playAttentionSound: vi.fn(async () => true) }));
const respond = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8100' } }),
}));
vi.mock('@/hooks/use-attention-response', () => ({ useAttentionResponse: () => respond }));
const proposals = vi.hoisted(() => ({
  list: [] as unknown[],
  recent: [] as unknown[],
  transcript: [] as unknown[],
  retryTurn: vi.fn(async () => ({})),
}));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    memoryProposals: async () => proposals.list,
    sessionPage: async () => ({ sessions: proposals.recent }),
    transcript: async () => ({ messages: proposals.transcript }),
    retryTurn: proposals.retryTurn,
  }),
}));
const versionStatus = vi.hoisted(() => ({
  value: { state: 'current', desktopShell: false, updating: false } as Record<string, unknown>,
}));
vi.mock('@/hooks/use-system-version-status', () => ({
  useSystemVersionStatus: () => versionStatus.value,
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

const notifierQueries = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Notifier(props: {
  activeSessionId: string;
  attentions: Record<string, SessionAttention>;
  sessions: Session[];
}) {
  return (
    <QueryClientProvider client={notifierQueries}>
      <MemoryRouter>
        <NotificationPreferencesProvider>
          <ClioAttentionNotifier {...props} />
          <CurrentPath />
        </NotificationPreferencesProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function CurrentPath() {
  return <output data-testid="current-path">{useLocation().pathname}</output>;
}

describe('ClioAttentionNotifier', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      'clio.notifications.v2',
      JSON.stringify({ attentionSound: 'always', desktopNotifications: false }),
    );
    // Asked already: these cases are not about the first-run prompt.
    window.localStorage.setItem('clio.notifications.asked', '2026-09-01T00:00:00Z');
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
    await waitFor(() => expect(playAttentionSound).toHaveBeenCalledTimes(1));

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

    await waitFor(() => expect(playAttentionSound).toHaveBeenCalledTimes(2));
  });

  it('never toasts a pending request: the bell mirrors it, toasts are for what you just did', async () => {
    const backgroundSession: Session = { ...baseSession, id: 'sess_background' };
    render(
      <Notifier
        activeSessionId="sess_active"
        attentions={{ [backgroundSession.id]: waitingAttention(backgroundSession.id) }}
        sessions={[backgroundSession]}
      />,
    );

    await waitFor(() => expect(playAttentionSound).toHaveBeenCalledTimes(1));
    expect(toast.warning).not.toHaveBeenCalled();
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
    expect(playAttentionSound).not.toHaveBeenCalled();
  });

  it('surfaces a muted attention sound at least once per preference change', async () => {
    window.localStorage.setItem(
      'clio.notifications.v2',
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

  it('asks once on first run, and the system prompt follows the click', async () => {
    window.localStorage.removeItem('clio.notifications.asked');
    const requestPermission = vi.fn(async () => 'granted' as const);
    vi.stubGlobal(
      'Notification',
      Object.assign(function Notification() {}, { permission: 'default', requestPermission }),
    );
    try {
      render(<Notifier activeSessionId="other" attentions={{}} sessions={[]} />);
      await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
      const [title, options] = vi.mocked(toast).mock.calls[0] as unknown as [
        string,
        { action: { onClick: () => void } },
      ];
      expect(title).toMatch(/Get notified/);
      expect(requestPermission).not.toHaveBeenCalled();

      options.action.onClick();
      expect(requestPermission).toHaveBeenCalledTimes(1);
      expect(window.localStorage.getItem('clio.notifications.asked')).not.toBeNull();
    } finally {
      vi.unstubAllGlobals();
      vi.mocked(toast).mockClear();
    }
  });

  describe('finished work', () => {
    const notices: {
      title: string;
      options?: NotificationOptions;
      onclick?: (() => void) | null;
    }[] = [];
    let hasFocus: MockInstance<() => boolean>;
    beforeEach(() => {
      notices.length = 0;
      vi.stubGlobal(
        'Notification',
        Object.assign(
          function Notification(title: string, options?: NotificationOptions) {
            const notice = { title, options, onclick: null, close: vi.fn() };
            notices.push(notice);
            return notice;
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
      window.localStorage.setItem('clio.notifications.v2', JSON.stringify({ finishedWork }));
      const session: Session = { ...baseSession, id: 'sess_run', state: from };
      const { rerender } = render(
        <Notifier activeSessionId="other" attentions={{}} sessions={[session]} />,
      );
      rerender(
        <Notifier activeSessionId="other" attentions={{}} sessions={[{ ...session, state: to }]} />,
      );
    }

    it('alerts on the desktop when a background run finishes or stops', async () => {
      runTo('desktop', 'running', 'completed');
      await waitFor(() =>
        expect(notices.map((notice) => notice.title)).toEqual(['Session One finished']),
      );
      cleanup();
      runTo('desktop', 'running', 'failed');
      await waitFor(() =>
        expect(notices.map((notice) => notice.title)).toEqual([
          'Session One finished',
          'Session One stopped',
        ]),
      );
    });

    it('opens the conversation when its banner is clicked', async () => {
      runTo('desktop', 'running', 'completed');
      await waitFor(() => expect(notices).toHaveLength(1));
      notices[0].onclick?.();
      await waitFor(() =>
        expect(screen.getByTestId('current-path')).toHaveTextContent(
          '/workspaces/ws_1/sessions/sess_run',
        ),
      );
    });

    it('stays in the bell when chosen and says nothing for a run you cancelled', async () => {
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
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      NOTIFICATION_READS_STORAGE_KEY,
      JSON.stringify({ since: '2026-09-01T00:00:00Z', readThrough: '2026-09-01T00:00:00Z' }),
    );
    resetNotificationReadsForTest();
    proposals.list = [];
    proposals.recent = [];
    versionStatus.value = { state: 'current', desktopShell: false, updating: false };
  });
  afterEach(cleanup);

  function Center(props: {
    attentions: Record<string, SessionAttention>;
    sessions: Session[];
    workspaces?: Workspace[];
  }) {
    return (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <TooltipProvider>
            <SidebarProvider>
              <NotificationPreferencesProvider>
                <ClioAttentionCenter activeSessionId="sess_1" {...props} />
              </NotificationPreferencesProvider>
            </SidebarProvider>
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  function ended(id: string, state: Session['state'], day: number): Session {
    return {
      ...baseSession,
      id,
      title: `Run ${id}`,
      state,
      updated_at: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`,
    };
  }

  it('lists runs that ended while away, marks them read, and folds the earlier ones', async () => {
    const workspace = { id: 'ws_1', name: 'lab', display_name: 'Lab' } as Workspace;
    const sessions = [
      { ...ended('sess_1', 'completed', 9) },
      ended('done', 'completed', 8),
      ended('broke', 'failed', 7),
      ended('held', 'paused', 6),
      ended('old', 'completed', 1),
      ...[2, 3, 4, 5].map((day) => ended(`more_${day}`, 'cancelled', day)),
    ];
    render(<Center attentions={{}} sessions={sessions} workspaces={[workspace]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'While you were away' }),
    ).toBeInTheDocument();
    // The open conversation and a run that ended before the bell kept notes are not news.
    expect(within(dialog).queryByText('Run sess_1')).toBeNull();
    expect(within(dialog).queryByText('Run old')).toBeNull();
    expect(
      within(dialog).getByRole('link', { name: 'Run done finished: In Lab' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', {
        name: 'Run broke stopped: In Lab',
      }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Retry Run broke' })).toBeInTheDocument();
    expect(
      within(within(dialog).getByRole('link', { name: /Run held paused/ })).getByText('Review'),
    ).toBeInTheDocument();
    // Seven rows: five show, two fold into "2 earlier".
    expect(dialog.querySelectorAll('[data-slot="attention-away"]')).toHaveLength(5);
    fireEvent.click(within(dialog).getByRole('button', { name: '2 earlier' }));
    expect(dialog.querySelectorAll('[data-slot="attention-away"]')).toHaveLength(7);

    const markAll = within(dialog).getByRole('button', { name: 'Mark all read' });
    expect(dialog.querySelectorAll('[data-read]')).toHaveLength(0);
    fireEvent.click(markAll);
    expect(dialog.querySelectorAll('[data-read]')).toHaveLength(7);
    expect(markAll).toBeDisabled();
    expect(
      JSON.parse(window.localStorage.getItem(NOTIFICATION_READS_STORAGE_KEY)!).readThrough,
    ).toBeTruthy();
  });

  it('reads runs that ended in other conversations from the recent page', async () => {
    proposals.recent = [ended('elsewhere', 'completed', 8), ended('done', 'running', 7)];
    // The page's own copy of a conversation is fresher than the recent page's.
    render(<Center attentions={{}} sessions={[ended('done', 'failed', 9)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByRole('link', { name: /^Run elsewhere finished/ }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /^Run done stopped/ })).toBeInTheDocument();
  });
  it('retries a stopped run in place', async () => {
    proposals.transcript = [
      { id: 'msg_9', role: 'assistant', blocks: [{ type: 'error', recoverable: true }] },
    ];
    render(<Center attentions={{}} sessions={[ended('broke', 'failed', 6)]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry Run broke' }));
    await waitFor(() =>
      expect(proposals.retryTurn).toHaveBeenCalledWith('broke', 'msg_9', { execute: true }),
    );
  });
  it('leaves finished and stopped runs out with Finished work off, keeping paused ones', async () => {
    window.localStorage.setItem('clio.notifications.v2', JSON.stringify({ finishedWork: 'off' }));
    const sessions = [
      ended('done', 'completed', 8),
      ended('halted', 'cancelled', 7),
      ended('broke', 'failed', 6),
      ended('held', 'paused', 5),
    ];
    render(<Center attentions={{}} sessions={sessions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: /^Run held paused/ })).toBeInTheDocument();
    expect(within(dialog).queryByText('Run done')).toBeNull();
    expect(within(dialog).queryByText('Run halted')).toBeNull();
    expect(within(dialog).queryByText('Run broke')).toBeNull();
  });
  it('shows memories to review under CLIO, naming the conversations they came from', async () => {
    proposals.list = [
      { id: 'p1', evidence: [{ session: 'sess_1' }] },
      { id: 'p2', evidence: [{ session: 'sess_1' }, { session: 'gone' }] },
    ];
    render(<Center attentions={{}} sessions={[baseSession]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog = await screen.findByRole('dialog');
    const memories = await within(dialog).findByRole('link', { name: /2 memories to review/ });
    expect(memories).toHaveAttribute('href', '/settings/memory?view=review');
    expect(within(memories).getByText('Suggested from Session One')).toBeInTheDocument();
    expect(within(memories).getByText('Review')).toBeInTheDocument();
  });

  it('keeps the bell with no badge when nothing needs a response', async () => {
    render(<Center attentions={{}} sessions={[baseSession]} />);
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(within(bell).queryByText(/\d/)).toBeNull();
    fireEvent.click(bell);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Nothing needs you.')).toBeInTheDocument();
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
  });

  it('says a failed update check could not finish, with no Update action or badge', async () => {
    versionStatus.value = {
      state: 'unavailable',
      desktopShell: true,
      updating: false,
      message:
        "Could not check for updates: this app's release v0.9.6-beta.0 is not published, so the runtime (0.9.5.1) cannot be restored to match it.",
    };
    render(<Center attentions={{}} sessions={[baseSession]} />);
    const bell = screen.getByRole('button', { name: 'Notifications' });
    expect(within(bell).queryByText(/\d/)).toBeNull();
    fireEvent.click(bell);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText("Couldn't check for updates")).toBeInTheDocument();
    expect(
      within(dialog).getAllByText(/^This app's release v0\.9\.6-beta\.0 is not published/)[0],
    ).toBeInTheDocument();
    expect(within(dialog).queryByText('Update ready')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Update' })).toBeNull();
  });

  it('offers Update only when a newer release is ready', async () => {
    versionStatus.value = {
      state: 'available',
      desktopShell: true,
      updating: false,
      updateAll: vi.fn(),
    };
    render(<Center attentions={{}} sessions={[baseSession]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Update ready')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Update' })).toBeInTheDocument();
    expect(within(dialog).queryByText("Couldn't check for updates")).toBeNull();
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
