import type { Session } from '@clio/core/v3';
import {
  BellIcon,
  BellRingIcon,
  LayoutTemplateIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
  TextCursorInputIcon,
  type LucideIcon,
} from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { playAttentionSound } from '@/lib/attention-sound';
import { PROTOCOL, vocab } from '@/lib/brand-vocabulary';
import { AdjustIcon, InfoIcon } from '@/lib/icon-vocabulary';
import { ATTENTION_NOTICE_THROTTLE_MS } from '@/lib/runtime-limits';
import { type SessionAttention, sessionAttentionIds } from '@/lib/session-attention';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import {
  type AttentionSoundMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';
import { useSystemVersionStatus } from '@/hooks/use-system-version-status';
import { ProductUpdateIcon } from './product-update-summary';
import { ClioRelativeTime } from './relative-time';

interface AttentionProps {
  activeSessionId: string;
  attentions: Readonly<Record<string, SessionAttention>>;
  sessions: readonly Session[];
}

const notifiedAttentionIds = new Set<string>();
const lastAttentionNoticeAt = new Map<string, number>();

function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const links = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button')];
  if (links.length === 0) return;
  event.preventDefault();
  const index = links.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === 'ArrowDown'
      ? links[(index + 1) % links.length]
      : links[(index - 1 + links.length) % links.length];
  next?.focus();
}

/**
 * The bell: always in the left bar's header, counting what needs a response.
 * It opens one surface with a fixed group order. "Needs you" mirrors pending
 * requests and the agent group holds a ready update. Things that happened
 * while you were away need a background-finish event the runtime does not
 * send yet.
 */
export function ClioAttentionCenter({ activeSessionId, attentions, sessions }: AttentionProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const versions = useSystemVersionStatus();
  const entries = useMemo(
    () =>
      sessions
        .filter((session) => !session.archived && attentions[session.id]?.total)
        .map((session) => ({ session, attention: attentions[session.id]! })),
    [attentions, sessions],
  );
  const responseCount = entries.reduce((total, entry) => total + entry.attention.total, 0);
  const updateReady = versions.state === 'available';
  useShortcut('notifications', () => setOpen((current) => !current));
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

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <IconButton
          className={cn(
            'shrink-0',
            responseCount > 0 && 'text-action hover:text-action',
            responseCount === 0 && updateReady && 'text-info',
          )}
          count={responseCount || undefined}
          icon={responseCount > 0 ? <BellRingIcon /> : <BellIcon />}
          label={label}
          shortcut="notifications"
          tooltipSide="bottom"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[420px] max-w-[calc(100vw-16px)] gap-0 p-0"
        onOpenAutoFocus={(event) => {
          // Start on the first notification, not the settings button.
          const first = listRef.current?.querySelector<HTMLElement>('a[href], button');
          if (!first) return;
          event.preventDefault();
          first.focus();
        }}
        side="bottom"
      >
        <div className="flex h-9 items-center gap-2 border-b border-border/70 pr-1.5 pl-3">
          <PopoverTitle className="text-[13.5px] font-semibold">Notifications</PopoverTitle>
          <IconButton
            className="ml-auto"
            icon={<AdjustIcon />}
            label="Notification settings"
            onClick={() => {
              setOpen(false);
              navigate('/settings/notifications');
            }}
            size="sm"
          />
        </div>
        <div
          className="clio-scrollbar max-h-[min(420px,70vh)] overflow-y-auto p-1"
          onKeyDown={moveFocus}
          ref={listRef}
        >
          <section aria-labelledby="attention-needs-you">
            <h3
              className="flex h-6 items-center gap-2 px-1.5 text-[11px] font-semibold text-muted-foreground"
              id="attention-needs-you"
            >
              <span>Needs you</span>
              <span className="text-warning tabular-nums">{responseCount}</span>
            </h3>
            {entries.length ? (
              entries.map(({ session, attention }) => {
                const summary = attentionSummary(attention);
                const KindIcon = summary.kind.icon;
                return (
                  <Link
                    aria-label={`${session.title}: ${summary.words}`}
                    className="block rounded-[6px] outline-none focus-visible:bg-menu-highlight [&:is(:focus-visible,:has([data-selected]))_.text-link]:text-accent-foreground [&:is(:focus-visible,:has([data-selected]))_.text-muted-foreground]:text-foreground"
                    key={session.id}
                    onClick={() => setOpen(false)}
                    to={`/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`}
                  >
                    <ListRow
                      description={summary.words}
                      icon={<KindIcon aria-hidden="true" className="text-warning" />}
                      layout="stacked"
                      meta={
                        <span className="flex flex-col items-end leading-[1.3]">
                          <ClioRelativeTime
                            className="text-[11px] text-muted-foreground"
                            compact
                            label="Updated"
                            timestamp={session.last_interaction_at ?? session.updated_at}
                          />
                          <span className="text-[12px] font-medium text-link">
                            {summary.kind.action}
                          </span>
                        </span>
                      }
                      selected={session.id === activeSessionId}
                      title={
                        <span title={`${session.title} ${summary.kind.verb}`}>
                          <span className="font-semibold">{session.title}</span>{' '}
                          <span className="text-muted-foreground">{summary.kind.verb}</span>
                        </span>
                      }
                    />
                  </Link>
                );
              })
            ) : (
              <p className="px-1.5 pb-1 text-[12px] text-muted-foreground">
                Nothing is waiting for you.
              </p>
            )}
          </section>
          {updateReady ? (
            <>
              <GroupLabel>{vocab.agent}</GroupLabel>
              <ListRow
                description={versions.message}
                icon={<ProductUpdateIcon state={versions.state} />}
                meta={
                  versions.desktopShell ? (
                    <button
                      className="text-[12px] text-primary hover:underline disabled:opacity-50"
                      disabled={versions.updating}
                      onClick={() => versions.updateAll()}
                      type="button"
                    >
                      Update
                    </button>
                  ) : undefined
                }
                title="Update ready"
              />
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-1.5 pb-0.5 pt-1.5 text-[11px] font-medium text-muted-foreground first:pt-0.5">
      {children}
    </p>
  );
}

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

export function ClioAttentionNotifier({ activeSessionId, attentions, sessions }: AttentionProps) {
  const navigate = useNavigate();
  const { attentionSound, desktopNotifications } = useNotificationPreferences();
  const reportedSoundFailureFor = useRef<AttentionSoundMode | null>(null);

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
    let shouldPlaySound = false;
    for (const session of newSessions) {
      const path = `/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`;
      const now = Date.now();
      const shouldInterrupt =
        now - (lastAttentionNoticeAt.get(session.id) ?? 0) > ATTENTION_NOTICE_THROTTLE_MS;
      lastAttentionNoticeAt.set(session.id, now);
      shouldPlaySound ||= shouldInterrupt;
      // The session already open shows this same attention inline (the
      // pending-interactions surface); toasting on top of it is redundant.
      if (session.id !== activeSessionId) {
        toast.warning('Response needed', {
          id: `clio-attention:${session.id}`,
          description: session.title,
          action: {
            label: 'Open',
            onClick: () => navigate(path),
          },
        });
      }
      if (
        desktopNotifications &&
        shouldInterrupt &&
        !appFocused &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        const notification = new Notification('Response needed', {
          body: session.title,
          tag: `clio-attention:${session.id}`,
        });
        notification.addEventListener('click', () => {
          window.focus();
          navigate(path);
          notification.close();
        });
      }
    }
    if (
      shouldPlaySound &&
      (attentionSound === 'always' || (attentionSound === 'background' && !appFocused))
    ) {
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
    }
  }, [activeSessionId, attentionSound, attentions, desktopNotifications, navigate, sessions]);

  return null;
}
