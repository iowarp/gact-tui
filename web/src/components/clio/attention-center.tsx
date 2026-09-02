import type { Session } from '@clio/core/v3';
import { BellRingIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { playAttentionSound } from '@/lib/attention-sound';
import { ATTENTION_NOTICE_THROTTLE_MS } from '@/lib/runtime-limits';
import { type SessionAttention, sessionAttentionIds } from '@/lib/session-attention';
import {
  type AttentionSoundMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';
import { SessionAttentionIndicators } from './session-attention-indicators';

interface AttentionProps {
  activeSessionId: string;
  attentions: Readonly<Record<string, SessionAttention>>;
  sessions: readonly Session[];
}

const notifiedAttentionIds = new Set<string>();
const lastAttentionNoticeAt = new Map<string, number>();

export function ClioAttentionCenter({ activeSessionId, attentions, sessions }: AttentionProps) {
  const [open, setOpen] = useState(false);
  const entries = useMemo(
    () =>
      sessions
        .filter((session) => !session.archived && attentions[session.id]?.total)
        .map((session) => ({ session, attention: attentions[session.id]! })),
    [attentions, sessions],
  );
  const responseCount = entries.reduce((total, entry) => total + entry.attention.total, 0);
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
            aria-label={`${label}; ${responseCount} ${responseCount === 1 ? 'response' : 'responses'} pending`}
            className="relative size-8 text-action hover:text-action"
            tooltip={label}
            type="button"
          >
            <BellRingIcon aria-hidden="true" />
            <Badge
              className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[9px]"
              variant="default"
            >
              {responseCount > 9 ? '9+' : responseCount}
            </Badge>
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80" side="bottom">
          <PopoverHeader>
            <PopoverTitle>Response needed</PopoverTitle>
            <PopoverDescription>Open a session to continue.</PopoverDescription>
          </PopoverHeader>
          <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {entries.map(({ session, attention }) => (
              <Button
                asChild
                className="h-auto min-h-12 justify-start px-2 py-2 text-left"
                key={session.id}
                variant={session.id === activeSessionId ? 'secondary' : 'ghost'}
              >
                <Link
                  onClick={() => setOpen(false)}
                  to={`/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{session.title}</span>
                    <SessionAttentionIndicators attention={attention} />
                  </span>
                </Link>
              </Button>
            ))}
          </div>
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
