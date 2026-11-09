import type { Session } from '@clio/core/v3';
import {
  BellRingIcon,
  LayoutTemplateIcon,
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
  TextCursorInputIcon,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { playAttentionSound } from '@/lib/attention-sound';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import { AdjustIcon, InfoIcon } from '@/lib/icon-vocabulary';
import { ATTENTION_NOTICE_THROTTLE_MS } from '@/lib/runtime-limits';
import { type SessionAttention, sessionAttentionIds } from '@/lib/session-attention';
import { useShortcut, useShortcutPresentation } from '@/lib/shortcuts/hooks';
import {
  type AttentionSoundMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';
import { IconButton } from './primitives/icon-button';
import { HeldKeyBadge } from './primitives/key-chip';
import { ListRow } from './primitives/list-row';
import { ClioRelativeTime } from './relative-time';

interface AttentionProps {
  activeSessionId: string;
  attentions: Readonly<Record<string, SessionAttention>>;
  sessions: readonly Session[];
}

const notifiedAttentionIds = new Set<string>();
const lastAttentionNoticeAt = new Map<string, number>();

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

function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const links = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href]')];
  if (links.length === 0) return;
  event.preventDefault();
  const index = links.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === 'ArrowDown'
      ? links[(index + 1) % links.length]
      : links[(index - 1 + links.length) % links.length];
  next?.focus();
}

export function ClioAttentionCenter({ activeSessionId, attentions, sessions }: AttentionProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const shortcut = useShortcutPresentation('notifications');
  const entries = useMemo(
    () =>
      sessions
        .filter((session) => !session.archived && attentions[session.id]?.total)
        .map((session) => ({ session, attention: attentions[session.id]! })),
    [attentions, sessions],
  );
  const responseCount = entries.reduce((total, entry) => total + entry.attention.total, 0);
  useShortcut('notifications', () => {
    if (responseCount > 0) setOpen((current) => !current);
  });
  if (responseCount === 0) return null;

  const label =
    entries.length === 1
      ? `${entries[0]!.session.title} needs your response`
      : `${entries.length} sessions need your response`;

  return (
    <SidebarMenuItem className="shrink-0">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <SidebarMenuButton
            aria-keyshortcuts={shortcut?.aria}
            aria-label={`${label}; ${responseCount} ${responseCount === 1 ? 'response' : 'responses'} pending`}
            className="relative size-8 overflow-visible text-muted-foreground hover:text-foreground"
            tooltip={shortcut ? `${label} (${shortcut.text})` : label}
            type="button"
          >
            <BellRingIcon aria-hidden="true" />
            <HeldKeyBadge id="notifications" />
            <Badge
              className="absolute -right-1 -top-1 h-[15px] min-w-[15px] rounded-full bg-warning px-1 text-[9.5px] font-bold text-background"
              variant="default"
            >
              {responseCount > 9 ? '9+' : responseCount}
            </Badge>
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          alignOffset={-6}
          className="w-[420px] max-w-[calc(100vw-16px)] gap-0 p-0"
          collisionPadding={8}
          onOpenAutoFocus={(event) => {
            // Start on the first notification, not the settings button.
            const first = listRef.current?.querySelector<HTMLElement>('a[href]');
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
          <section aria-labelledby="attention-needs-you" className="p-1">
            <h3
              className="flex h-6 items-center gap-2 px-1.5 text-[11px] font-semibold text-muted-foreground"
              id="attention-needs-you"
            >
              <span>Needs you</span>
              <span className="text-warning tabular-nums">{responseCount}</span>
            </h3>
            <div
              className="clio-scrollbar flex max-h-72 flex-col overflow-y-auto"
              onKeyDown={moveFocus}
              ref={listRef}
            >
              {entries.map(({ session, attention }) => {
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
              })}
            </div>
          </section>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
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
