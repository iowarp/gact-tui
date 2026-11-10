import type { PendingInteraction, Session, Workspace } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellIcon,
  BrainCircuitIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  LayoutTemplateIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
  TextCursorInputIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { useAttentionResponse } from '@/hooks/use-attention-response';
import { useRepository } from '@/hooks/use-repository';
import { useSystemVersionStatus } from '@/hooks/use-system-version-status';
import { playAttentionSound } from '@/lib/attention-sound';
import { PROTOCOL, vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { PRIMARY_SESSION_KINDS } from '@/lib/recent-sessions';
import { SettingsIcon, InfoIcon } from '@/lib/icon-vocabulary';
import {
  markAllNotificationsRead,
  markConversationSeen,
  useNotificationReads,
} from '@/lib/notification-reads';
import { ATTENTION_NOTICE_THROTTLE_MS, WAITING_SESSIONS_POLL_MS } from '@/lib/runtime-limits';
import { type SessionAttention, sessionAttentionIds } from '@/lib/session-attention';
import { useShortcut } from '@/lib/shortcuts/hooks';
import {
  listenForNotificationOpen,
  notificationPermission,
  requestNotificationPermission,
  setAttentionBadge,
  showSystemNotice,
  type SystemNoticeResult,
} from '@/lib/system-notifications';
import { useConnectionSettings } from '@/providers/connection-provider';
import { cn } from '@/lib/utils';
import {
  type AttentionSoundMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';
import { type AwayTone, awayRows } from './attention-away';
import { IconButton } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';
import { permissionCommand } from './permission-operation-labels';
import { ProductUpdateIcon } from './product-update-summary';
import { ClioRelativeTime } from './relative-time';

interface AttentionProps {
  activeSessionId: string;
  attentions: Readonly<Record<string, SessionAttention>>;
  sessions: readonly Session[];
  /** Names the place of a run that ended while away. */
  workspaces?: readonly Workspace[];
}

/** Rows "While you were away" shows before folding the rest into "N earlier". */
const AWAY_VISIBLE = 5;
/** Recent conversations read for that group: enough to fill it and its fold. */
const AWAY_PAGE = 30;

const AWAY_ICON: Record<AwayTone, ReactNode> = {
  success: <CheckIcon className="text-accent-foreground" />,
  error: <XIcon className="text-destructive-text" />,
  warning: <TriangleAlertIcon className="text-warning" />,
  stopped: <CircleIcon className="text-muted-foreground" />,
};

function sessionPath(session: Session): string {
  return `/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`;
}

/** "Suggested from A and B", from the conversations a proposal cites. */
function suggestedFrom(sessionIds: readonly string[], sessions: readonly Session[]): string {
  const titles = new Map(sessions.map((session) => [session.id, session.title]));
  const named = [...new Set(sessionIds)].flatMap((id) => {
    const title = titles.get(id);
    return title ? [title] : [];
  });
  if (named.length === 0) return 'Suggested from your conversations';
  if (named.length === 1) return `Suggested from ${named[0]}`;
  if (named.length === 2) return `Suggested from ${named[0]} and ${named[1]}`;
  return `Suggested from ${named[0]}, ${named[1]} and ${named.length - 2} more`;
}

const notifiedAttentionIds = new Set<string>();
const lastAttentionNoticeAt = new Map<string, number>();

/** A run in one of these states can still finish. */
const ACTIVE_RUN_STATES = new Set<Session['state']>([
  'queued',
  'running',
  'stopping',
  'recovering',
  'waiting_permission',
  'waiting_user',
]);
/** How a run that ended reads in its alert; other end states (cancelled) were your own doing. */
const ENDED_RUN_VERBS: Partial<Record<Session['state'], string>> = {
  completed: 'finished',
  failed: 'stopped',
  interrupted: 'stopped',
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

interface AttentionKind {
  icon: LucideIcon;
  /** Follows the conversation's name: "Survey wants approval". */
  verb: string;
  /** The row's one action word. */
  action: string;
}

/**
 * What a session is waiting on: every pending count as words, and the kind of
 * the first one, which names the row's verb, icon and action.
 */
function attentionSummary(attention: SessionAttention): { words: string; kind: AttentionKind } {
  const parts: string[] = [];
  let kind: AttentionKind | undefined;
  const add = (count: number, one: string, many: string, next: AttentionKind) => {
    if (!count) return;
    parts.push(plural(count, one, many));
    kind ??= next;
  };
  add(attention.permissionIds.length, 'approval', 'approvals', {
    icon: ShieldQuestionIcon,
    verb: 'wants approval',
    action: 'Review',
  });
  add(attention.questionIds.length, 'question', 'questions', {
    icon: MessageCircleQuestionIcon,
    verb: 'asked a question',
    action: 'Answer',
  });
  add(attention.mcpTaskInputIds.length, 'task input', 'task inputs', {
    icon: TextCursorInputIcon,
    verb: 'needs a value',
    action: 'Open',
  });
  add(attention.a2uiIds.length, `${PROTOCOL.a2ui} surface`, `${PROTOCOL.a2ui} surfaces`, {
    icon: LayoutTemplateIcon,
    verb: 'shows a form',
    action: 'Open',
  });
  add(attention.unknownIds.length, 'unrecognized request', 'unrecognized requests', {
    icon: InfoIcon,
    verb: 'sent a request',
    action: 'Open',
  });
  return {
    words: parts.join(', '),
    kind: kind ?? { icon: InfoIcon, verb: 'needs you', action: 'Open' },
  };
}

const REQUEST_KINDS: Readonly<Record<string, AttentionKind>> = {
  permission: { icon: ShieldQuestionIcon, verb: 'wants approval', action: 'Open' },
  question: { icon: MessageCircleQuestionIcon, verb: 'asked a question', action: 'Answer' },
  mcp_task_input: { icon: TextCursorInputIcon, verb: 'needs a value', action: 'Open' },
  a2ui: { icon: LayoutTemplateIcon, verb: 'shows a form', action: 'Open' },
};

interface NeedRow {
  key: string;
  session: Session;
  kind: AttentionKind;
  detail: ReactNode;
  /** The detail as words, for the hover name and the link's accessible name. */
  detailText: string;
  timestamp: string;
  /** A permission this row can allow or deny in place. */
  permission?: PendingInteraction;
}

/** One row for one pending request: its own verb, what it asks, and its action. */
function requestRow(session: Session, request: PendingInteraction): NeedRow {
  const row = { key: request.id, session, timestamp: request.created_at };
  const kind = REQUEST_KINDS[request.kind];
  if (!kind) {
    const detail = "This version can't show it.";
    return {
      ...row,
      kind: { icon: InfoIcon, verb: 'sent a request', action: 'Open' },
      detail,
      detailText: detail,
    };
  }
  if (request.kind === 'permission') {
    const actions = request.actions ?? [];
    const permission = actions.includes('allow') && actions.includes('deny') ? request : undefined;
    const { command, computer } = permissionCommand(request);
    if (command) {
      const where = computer ? ` on ${computer}` : '';
      return {
        ...row,
        kind: { ...kind, verb: 'wants to run a command' },
        detail: (
          <>
            <code className="font-mono text-[11px] text-foreground/85">{command}</code>
            {where}
          </>
        ),
        detailText: `${command}${where}`,
        permission,
      };
    }
    const detail = request.title || request.prompt || '';
    return { ...row, kind, detail, detailText: detail, permission };
  }
  const detail = request.prompt || request.title;
  return { ...row, kind, detail, detailText: detail };
}

/**
 * Every pending request of a conversation as its own row. A conversation that
 * only reports a waiting state (no request record yet) keeps one summary row.
 */
function needRows(session: Session, attention: SessionAttention): NeedRow[] {
  const requests = attention.requests ?? [];
  const known = new Set(requests.map((request) => request.id));
  const rest = (ids: readonly string[]) => ids.filter((id) => !known.has(id));
  const remainder: SessionAttention = {
    ...attention,
    permissionIds: rest(attention.permissionIds),
    questionIds: rest(attention.questionIds),
    mcpTaskInputIds: rest(attention.mcpTaskInputIds),
    a2uiIds: rest(attention.a2uiIds),
    unknownIds: rest(attention.unknownIds),
  };
  const rows = requests.map((request) => requestRow(session, request));
  if (attention.total > requests.length) {
    const summary = attentionSummary(remainder);
    rows.push({
      key: `${session.id}:waiting`,
      session,
      kind: summary.kind,
      detail: summary.words,
      detailText: summary.words,
      timestamp: session.last_interaction_at ?? session.updated_at,
    });
  }
  return rows;
}

function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const links = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('a[href]:not([data-duplicate-link])'),
  ];
  if (links.length === 0) return;
  event.preventDefault();
  const index = links.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === 'ArrowDown'
      ? links[(index + 1) % links.length]
      : links[(index - 1 + links.length) % links.length];
  next?.focus();
}

export function ClioAttentionCenter({
  activeSessionId,
  attentions,
  sessions,
  workspaces,
}: AttentionProps) {
  const navigate = useNavigate();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [open, setOpen] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const versions = useSystemVersionStatus();
  const reads = useNotificationReads();
  const entries = useMemo(
    () =>
      sessions
        .filter((session) => !session.archived && attentions[session.id]?.total)
        .map((session) => ({ session, attention: attentions[session.id]! })),
    [attentions, sessions],
  );
  const responseCount = entries.reduce((total, entry) => total + entry.attention.total, 0);
  const rows = useMemo(
    () => entries.flatMap(({ session, attention }) => needRows(session, attention)),
    [entries],
  );
  // The page's sessions are the open conversation's family and those waiting on a
  // person; runs that ended elsewhere come from one bounded newest-first page,
  // read while the bell is open. The page's own copies are fresher, so they win.
  const recent = useQuery({
    queryKey: queryKeys.key('session-pages', settings.endpoint, 'bell-away'),
    queryFn: ({ signal }) =>
      repository.sessionPage({ kinds: PRIMARY_SESSION_KINDS, limit: AWAY_PAGE }, signal),
    enabled: open,
    staleTime: 15_000,
    retry: false,
  });
  const known = useMemo(() => {
    const byId = new Map<string, Session>();
    for (const session of recent.data?.sessions ?? []) byId.set(session.id, session);
    for (const session of sessions) byId.set(session.id, session);
    return [...byId.values()];
  }, [recent.data, sessions]);
  const { finishedWork } = useNotificationPreferences();
  // Finished work off: runs that finished or stopped stay out; paused and recovery still need a person.
  const away = useMemo(
    () =>
      awayRows(known, attentions, activeSessionId, reads, workspaces).filter(
        (row) => finishedWork !== 'off' || !row.ended,
      ),
    [activeSessionId, attentions, finishedWork, known, reads, workspaces],
  );
  const queryClient = useQueryClient();
  // Retry in place, as the conversation does: the newest reply, when it is an
  // assistant turn that ended empty or with a recoverable error, runs again on
  // the conversation's own model (the agent's choice when none is named). Anything else opens the conversation.
  const retry = useMutation({
    mutationFn: async (session: Session) => {
      const page = await repository.transcript(session.id, undefined, { limit: 1 });
      const last = page.messages.at(-1);
      const retryable =
        last?.role === 'assistant' &&
        (last.blocks.length === 0 ||
          last.blocks.some((block) => block.type === 'error' && block.recoverable));
      if (!last || !retryable) return false;
      await repository.retryTurn(session.id, last.id, { execute: true });
      return true;
    },
    onSuccess: async (retried, session) => {
      if (!retried) {
        setOpen(false);
        navigate(sessionPath(session));
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('session-pages', settings.endpoint),
      });
    },
    onError: (_, session) =>
      toast.error("Couldn't retry the run", {
        description: `Open ${session.title} to retry it there.`,
      }),
  });
  // Read only while the bell is open: the badge counts Needs you, not these.
  const proposals = useQuery({
    queryKey: ['memory', 'proposals', 'pending'],
    queryFn: ({ signal }) => repository.memoryProposals('pending', signal),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });
  const respond = useAttentionResponse();
  useShortcut('notifications', () => setOpen((current) => !current));

  const updateReady = versions.state === 'available';
  const memoryCount = proposals.data?.length ?? 0;
  const memorySources = suggestedFrom(
    (proposals.data ?? []).flatMap((proposal) => proposal.evidence.map((item) => item.session)),
    sessions,
  );
  const shownAway = showEarlier ? away : away.slice(0, AWAY_VISIBLE);
  const earlier = away.length - shownAway.length;
  const unread = away.some((row) => !row.read);
  const empty = rows.length === 0 && away.length === 0 && !updateReady && memoryCount === 0;
  // The bell is always there; its badge counts Needs you.
  const label =
    responseCount === 0
      ? updateReady
        ? 'Notifications: update ready'
        : 'Notifications'
      : `${
          entries.length === 1
            ? `${entries[0]!.session.title} needs your response`
            : `${entries.length} sessions need your response`
        }; ${responseCount} ${responseCount === 1 ? 'response' : 'responses'} pending`;
  const groupLabel = 'px-2 pt-2.5 pb-1 text-[11px] font-semibold text-muted-foreground';
  // Spec `.nf`: at least 46px, 6px 8px, so the age and the action share the right column.
  const rowFrame =
    'min-h-[46px] rounded-[6px] px-2 py-1.5 hover:bg-hover has-[a:focus-visible]:bg-hover';

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setShowEarlier(false);
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <IconButton
          // Spec `.nfbell`: the bell stays muted; the warning badge carries Needs you.
          className={cn('shrink-0', responseCount === 0 && updateReady && 'text-info')}
          count={responseCount || undefined}
          countTone="warning"
          hoverLabel={
            responseCount === 0 ? undefined : `Notifications, ${responseCount} need you`
          }
          icon={<BellIcon />}
          label={label}
          shortcut="notifications"
          tooltipSide="bottom"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        alignOffset={-6}
        className="w-[420px] max-w-[calc(100vw-16px)] gap-0 p-0"
        collisionPadding={8}
        onOpenAutoFocus={(event) => {
          // Start on the first notification, not the header's controls; an
          // empty list keeps focus on the popover itself.
          event.preventDefault();
          const first = listRef.current?.querySelector<HTMLElement>('a[href]');
          (first ?? (event.currentTarget as HTMLElement | null))?.focus();
        }}
        side="bottom"
      >
        <div className="flex h-[38px] items-center gap-2 pr-1.5 pl-3.5">
          <PopoverTitle className="text-[13.5px] font-semibold">Notifications</PopoverTitle>
          <button
            className="ml-auto rounded-[6px] px-1.5 py-0.5 text-[11.5px] font-semibold text-accent-foreground outline-none hover:underline focus-visible:ring-[1.5px] focus-visible:ring-ring disabled:text-faint disabled:no-underline"
            disabled={!unread}
            onClick={() =>
              markAllNotificationsRead(
                new Date(
                  Math.max(Date.now(), ...away.map((row) => Date.parse(row.timestamp) || 0)),
                ).toISOString(),
              )
            }
            type="button"
          >
            Mark all read
          </button>
          <IconButton
            icon={<SettingsIcon />}
            label="Notification settings"
            onClick={() => {
              setOpen(false);
              navigate('/settings/notifications');
            }}
            size="sm"
          />
        </div>
        {empty ? (
          <p className="px-4 pt-4 pb-3 text-[12.5px] text-muted-foreground">Nothing needs you.</p>
        ) : null}
        <div
          className="clio-scrollbar flex max-h-[min(30rem,70vh)] flex-col overflow-y-auto px-1.5 pb-2"
          hidden={empty}
          onKeyDown={moveFocus}
          ref={listRef}
        >
          {rows.length > 0 ? (
            <section aria-labelledby="attention-needs-you">
              <h3 className={cn('flex items-center gap-1.5', groupLabel)} id="attention-needs-you">
                <span>Needs you</span>
                <span className="text-faint tabular-nums">{responseCount}</span>
              </h3>
              {rows.map((row) => {
                const KindIcon = row.kind.icon;
                const { session } = row;
                const to = sessionPath(session);
                const deciding =
                  respond.isPending && respond.variables?.interaction.id === row.permission?.id;
                const decide = (action: 'allow' | 'deny') => {
                  if (!row.permission) return;
                  respond.mutate(
                    { interaction: row.permission, action },
                    {
                      onError: () =>
                        toast.error("Couldn't send your answer", {
                          description: `Open ${session.title} to answer it there.`,
                        }),
                    },
                  );
                };
                return (
                  <div className={rowFrame} data-slot="attention-request" key={row.key}>
                    <Link
                      aria-label={`${session.title} ${row.kind.verb}: ${row.detailText}`}
                      className="block outline-none"
                      onClick={() => setOpen(false)}
                      to={to}
                    >
                      <ListRow
                        description={row.detail}
                        hoverText={{
                          title: `${session.title} ${row.kind.verb}`,
                          description: row.detailText,
                        }}
                        icon={<KindIcon aria-hidden="true" className="text-warning" />}
                        meta={
                          <ClioRelativeTime
                            className="text-[11px] text-faint"
                            compact
                            label="Asked"
                            timestamp={row.timestamp}
                          />
                        }
                        primaryAction={row.permission ? undefined : row.kind.action}
                        title={
                          <>
                            <span className="font-semibold text-foreground">{session.title}</span>{' '}
                            {row.kind.verb}
                          </>
                        }
                        variant="notice"
                      />
                    </Link>
                    {row.permission ? (
                      <div
                        aria-label={`Decide: ${session.title} ${row.kind.verb}`}
                        className="mt-1 flex items-center gap-1.5 pl-[22px] text-[11.5px]"
                        role="group"
                      >
                        <Button
                          className="h-6 min-w-[58px] rounded-[6px] px-3 text-[11.5px] font-semibold"
                          disabled={deciding}
                          onClick={() => decide('allow')}
                          size="xs"
                        >
                          Allow
                        </Button>
                        <Button
                          className="h-6 min-w-[58px] rounded-[6px] px-3 text-[11.5px] font-normal"
                          disabled={deciding}
                          onClick={() => decide('deny')}
                          size="xs"
                          variant="secondary"
                        >
                          Deny
                        </Button>
                        <Link
                          aria-hidden="true"
                          className="ml-auto leading-6 font-semibold text-accent-foreground hover:underline"
                          data-duplicate-link=""
                          onClick={() => setOpen(false)}
                          tabIndex={-1}
                          to={to}
                        >
                          {row.kind.action}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}
          {away.length > 0 ? (
            <section aria-labelledby="attention-away">
              <h3 className={groupLabel} id="attention-away">
                While you were away
              </h3>
              {shownAway.map((row) => (
                <div
                  className={cn(rowFrame, 'relative', row.read && 'opacity-50')}
                  data-read={row.read || undefined}
                  data-slot="attention-away"
                  key={row.session.id}
                >
                  <Link
                    aria-label={`${row.session.title} ${row.verb}: ${row.detail}`}
                    className="block outline-none"
                    onClick={() => setOpen(false)}
                    to={sessionPath(row.session)}
                  >
                    <ListRow
                      description={row.detail}
                      hoverText={{
                        title: `${row.session.title} ${row.verb}`,
                        description: row.detail,
                      }}
                      icon={AWAY_ICON[row.tone]}
                      meta={
                        <ClioRelativeTime
                          className="text-[11px] text-faint"
                          compact
                          label="Ended"
                          timestamp={row.timestamp}
                        />
                      }
                      primaryAction={
                        row.action === 'Retry' ? (
                          <span aria-hidden="true" className="invisible">
                            Retry
                          </span>
                        ) : (
                          row.action
                        )
                      }
                      title={
                        <>
                          <span className="font-semibold text-foreground">{row.session.title}</span>{' '}
                          {row.verb}
                        </>
                      }
                      variant="notice"
                    />
                  </Link>
                  {row.action === 'Retry' ? (
                    <button
                      aria-label={`Retry ${row.session.title}`}
                      className="absolute right-2 bottom-1.5 text-[11.5px] leading-[18px] font-semibold text-accent-foreground hover:underline disabled:opacity-50"
                      disabled={retry.isPending && retry.variables?.id === row.session.id}
                      onClick={() => retry.mutate(row.session)}
                      type="button"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
          {updateReady || memoryCount > 0 ? (
            <section aria-labelledby="attention-agent">
              <h3 className={groupLabel} id="attention-agent">
                {vocab.agent}
              </h3>
              {updateReady ? (
                <div
                  className="min-h-[46px] rounded-[6px] px-2 py-1.5"
                  data-slot="attention-update"
                >
                  <ListRow
                    description={versions.message}
                    hoverText={{ description: versions.message }}
                    icon={<ProductUpdateIcon state={versions.state} />}
                    primaryAction={
                      versions.desktopShell ? (
                        <button
                          className="hover:underline disabled:opacity-50"
                          disabled={versions.updating}
                          onClick={() => versions.updateAll()}
                          type="button"
                        >
                          Update
                        </button>
                      ) : undefined
                    }
                    title={<span className="font-semibold text-foreground">Update ready</span>}
                    variant="notice"
                  />
                </div>
              ) : null}
              {memoryCount > 0 ? (
                <div className={rowFrame} data-slot="attention-memory">
                  <Link
                    className="block outline-none"
                    onClick={() => setOpen(false)}
                    to="/settings/memory?view=review"
                  >
                    <ListRow
                      description={memorySources}
                      hoverText={{ description: memorySources }}
                      icon={<BrainCircuitIcon />}
                      primaryAction="Review"
                      title={
                        <span className="font-semibold text-foreground">
                          {plural(memoryCount, 'memory', 'memories')} to review
                        </span>
                      }
                      variant="notice"
                    />
                  </Link>
                </div>
              ) : null}
            </section>
          ) : null}
          {earlier > 0 ? (
            <button
              className="flex h-7 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[11.5px] text-faint outline-none hover:bg-hover hover:text-muted-foreground focus-visible:bg-hover"
              onClick={() => setShowEarlier(true)}
              type="button"
            >
              <ChevronDownIcon aria-hidden="true" className="size-3.5" />
              {earlier} earlier
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ClioAttentionNotifier({ activeSessionId, attentions, sessions }: AttentionProps) {
  const navigate = useNavigate();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const { attentionSound, desktopNotifications, finishedWork } = useNotificationPreferences();
  const reportedSoundFailureFor = useRef<AttentionSoundMode | null>(null);
  const activeUpdatedAt = sessions.find((session) => session.id === activeSessionId)?.updated_at;

  // An open conversation is seen: how its run ends is not "while you were away".
  useEffect(() => {
    if (!activeSessionId) return;
    // The later of now and the run's own time, so a server clock ahead of this one cannot bring it back.
    const ended = Date.parse(activeUpdatedAt ?? '');
    const now = Date.now();
    markConversationSeen(
      activeSessionId,
      new Date(Number.isNaN(ended) ? now : Math.max(now, ended)).toISOString(),
    );
  }, [activeSessionId, activeUpdatedAt]);

  // A clicked banner opens its conversation, even one that started the app.
  useEffect(() => listenForNotificationOpen((path) => void navigate(path)), [navigate]);

  useAskForNotifications(desktopNotifications || finishedWork === 'desktop');

  // The Dock badge counts the conversations waiting on the person.
  const waitingCount = sessions.filter(
    (session) => !session.archived && (attentions[session.id]?.total ?? 0) > 0,
  ).length;
  useEffect(() => setAttentionBadge(waitingCount), [waitingCount]);

  /** Sound the chime under the person's setting, reporting a blocked one once per setting. */
  const chime = useCallback(
    (appFocused: boolean) => {
      if (attentionSound === 'off' || (attentionSound === 'background' && appFocused)) return;
      void playAttentionSound().then((played) => {
        // Surface a blocked chime at least once per preference change
        // instead of leaving a permanently-muted sound invisible. The ref
        // resets the report the moment the preference itself changes.
        if (played || reportedSoundFailureFor.current === attentionSound) return;
        reportedSoundFailureFor.current = attentionSound;
        toast.warning('Attention sound is muted', {
          description: 'The browser blocked the chime. Interact with the page once to allow it.',
        });
      });
    },
    [attentionSound],
  );

  const runStates = useRef(new Map<string, Session['state']>());
  // Runs seen active that left the list this notifier is given (the person
  // opened another conversation): read by id until they end, so how they end
  // still reaches the person.
  const [watchedIds, setWatchedIds] = useState<readonly string[]>([]);
  const watched = useQuery({
    queryKey: queryKeys.key('session-directory', settings.endpoint, ...watchedIds),
    queryFn: ({ signal }) => repository.sessionsById([...watchedIds], signal),
    enabled: watchedIds.length > 0,
    refetchInterval: WAITING_SESSIONS_POLL_MS,
  });
  const observed = useMemo(() => {
    const listed = new Set(sessions.map((session) => session.id));
    const extra = (watched.data ?? []).filter(
      (session) => watchedIds.includes(session.id) && !listed.has(session.id),
    );
    return [...sessions, ...extra];
  }, [sessions, watched.data, watchedIds]);

  // Finished work: a desktop alert when a run ends while the app is in the background.
  useEffect(() => {
    const previous = runStates.current;
    const next = new Map<string, Session['state']>();
    const appFocused = document.visibilityState === 'visible' && document.hasFocus();
    for (const session of observed) {
      if (session.archived) continue;
      next.set(session.id, session.state);
      const before = previous.get(session.id);
      const verb = ENDED_RUN_VERBS[session.state];
      if (
        !verb ||
        !before ||
        !ACTIVE_RUN_STATES.has(before) ||
        finishedWork !== 'desktop' ||
        appFocused
      ) {
        continue;
      }
      void showSystemNotice({
        id: `clio-finished:${session.id}`,
        title: `${session.title} ${verb}`,
        path: sessionPath(session),
        sound: attentionSound !== 'off',
      }).then((shown) => {
        if (!shown.sound) chime(appFocused);
      });
    }
    // Keep reading the runs still active that this list no longer holds.
    for (const [id, state] of previous) {
      if (!next.has(id) && ACTIVE_RUN_STATES.has(state)) next.set(id, state);
    }
    runStates.current = next;
    const listed = new Set(sessions.map((session) => session.id));
    const stillWatched = [...next]
      .filter(([id, state]) => !listed.has(id) && ACTIVE_RUN_STATES.has(state))
      .map(([id]) => id)
      .sort();
    setWatchedIds((current) =>
      current.length === stillWatched.length && current.every((id, i) => id === stillWatched[i])
        ? current
        : stillWatched,
    );
  }, [attentionSound, chime, finishedWork, observed, sessions]);

  useEffect(() => {
    const currentIds = new Set<string>();
    const currentSessionIds = new Set<string>();
    const newSessions: Session[] = [];
    for (const session of sessions) {
      // Matches the bell/center's own filter: an archived session's
      // attention is never shown there, so the notifier must not raise it
      // either.
      if (session.archived) continue;
      const attention = attentions[session.id];
      if (!attention?.total) continue;
      currentSessionIds.add(session.id);
      const ids = sessionAttentionIds(attention);
      ids.forEach((id) => currentIds.add(id));
      if (ids.some((id) => !notifiedAttentionIds.has(id))) {
        newSessions.push(session);
      }
    }
    // Prune both maps to what is CURRENTLY holding attention. Left add-only,
    // an id notified once is never forgotten: a question that is answered
    // and then a LATER question that raises the same synthetic marker
    // (`state:{sessionId}:waiting_user`) would never alert again, and the
    // maps would grow forever.
    for (const id of notifiedAttentionIds) {
      if (!currentIds.has(id)) notifiedAttentionIds.delete(id);
    }
    for (const sessionId of lastAttentionNoticeAt.keys()) {
      if (!currentSessionIds.has(sessionId)) lastAttentionNoticeAt.delete(sessionId);
    }
    currentIds.forEach((id) => notifiedAttentionIds.add(id));
    if (newSessions.length === 0) return;

    const appFocused = document.visibilityState === 'visible' && document.hasFocus();
    const wantsSound =
      attentionSound === 'always' || (attentionSound === 'background' && !appFocused);
    const banners: Promise<SystemNoticeResult>[] = [];
    let shouldPlaySound = false;
    for (const session of newSessions) {
      const now = Date.now();
      const shouldInterrupt =
        now - (lastAttentionNoticeAt.get(session.id) ?? 0) > ATTENTION_NOTICE_THROTTLE_MS;
      lastAttentionNoticeAt.set(session.id, now);
      shouldPlaySound ||= shouldInterrupt;
      // No toast: the bell's Needs you mirrors pending requests, and toasts
      // are only for what the person just did (conversation-states spec).
      if (desktopNotifications && shouldInterrupt && !appFocused) {
        banners.push(
          showSystemNotice({
            id: `clio-attention:${session.id}`,
            title: attentionTitle(attentions[session.id]),
            body: session.title,
            path: sessionPath(session),
            sound: wantsSound,
          }),
        );
      }
    }
    if (!shouldPlaySound || !wantsSound) return;
    // A banner that carries the system sound (which follows Focus and Do Not
    // Disturb) replaces the chime; otherwise the chime plays.
    void Promise.all(banners).then((results) => {
      if (!results.some((result) => result.sound)) chime(appFocused);
    });
  }, [activeSessionId, attentionSound, attentions, chime, desktopNotifications, sessions]);

  return null;
}

/** What a needs-you banner leads with: the kind of answer the conversation waits for. */
function attentionTitle(attention: SessionAttention | undefined): string {
  if (!attention) return 'Response needed';
  const approvals = attention.permissionIds.length;
  const questions = attention.questionIds.length + attention.mcpTaskInputIds.length;
  if (approvals > 0 && questions === 0) return 'Approval needed';
  if (questions > 0 && approvals === 0) return 'Question for you';
  return 'Response needed';
}

const ASKED_KEY = 'clio.notifications.asked';

/**
 * Asks once, on first run, whether the person wants system notices. The
 * system's own prompt follows their click, so the browser allows it and the
 * desktop app shows up in the system's notification settings.
 */
function useAskForNotifications(wanted: boolean) {
  useEffect(() => {
    if (!wanted) return;
    try {
      if (window.localStorage.getItem(ASKED_KEY)) return;
    } catch {
      return;
    }
    const remember = () => {
      try {
        window.localStorage.setItem(ASKED_KEY, new Date().toISOString());
      } catch {
        // Asked again next launch when storage is unavailable.
      }
    };
    let cancelled = false;
    void notificationPermission().then((permission) => {
      if (cancelled) return;
      if (permission !== 'default') {
        remember();
        return;
      }
      toast(`Get notified when ${vocab.agent} needs you`, {
        id: 'clio-notification-ask',
        description:
          'A system notice and sound when a conversation needs your answer or approval, or finishes while you are away.',
        duration: Infinity,
        action: {
          label: 'Allow',
          onClick: () => {
            remember();
            void requestNotificationPermission().then((answer) => {
              if (answer === 'denied') {
                toast('Notifications are off', {
                  description: 'Turn them on in Settings › Notifications at any time.',
                });
              }
            });
          },
        },
        cancel: { label: 'Not now', onClick: remember },
        onDismiss: remember,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [wanted]);
}
