import type { Session } from '@clio/core/v3';
import { BellRingIcon, ShieldQuestionIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import {
  type SessionAttention,
  sessionAttentionIds,
  sessionAttentionLabel,
} from '@/lib/session-attention';
import { useNotificationPreferences } from '@/providers/notification-preferences-provider';

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
            <PopoverTitle>Needs your response</PopoverTitle>
            <PopoverDescription>{label}</PopoverDescription>
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
                  <ShieldQuestionIcon aria-hidden="true" data-icon="inline-start" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{session.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {sessionAttentionLabel(attention)}
                    </span>
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

  useEffect(() => {
    const currentIds = new Set<string>();
    const newEntries: Array<{ session: Session; attention: SessionAttention }> = [];
    for (const session of sessions) {
      const attention = attentions[session.id];
      if (!attention?.total) continue;
      const ids = sessionAttentionIds(attention);
      ids.forEach((id) => currentIds.add(id));
      if (ids.some((id) => !notifiedAttentionIds.has(id))) {
        newEntries.push({ session, attention });
      }
    }
    currentIds.forEach((id) => notifiedAttentionIds.add(id));
    if (newEntries.length === 0) return;

    const appFocused = document.visibilityState === 'visible' && document.hasFocus();
    let shouldPlaySound = false;
    for (const { session, attention } of newEntries) {
      const path = `/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`;
      const now = Date.now();
      const shouldInterrupt = now - (lastAttentionNoticeAt.get(session.id) ?? 0) > 2_000;
      lastAttentionNoticeAt.set(session.id, now);
      shouldPlaySound ||= shouldInterrupt;
      toast.warning(`${session.title} needs your response`, {
        id: `clio-attention:${session.id}`,
        description: sessionAttentionLabel(attention),
        action: {
          label: session.id === activeSessionId ? 'View' : 'Open',
          onClick: () => navigate(path),
        },
      });
      if (
        desktopNotifications &&
        shouldInterrupt &&
        !appFocused &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        const notification = new Notification(`${session.title} needs your response`, {
          body: sessionAttentionLabel(attention),
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
      void playAttentionSound();
    }
  }, [activeSessionId, attentionSound, attentions, desktopNotifications, navigate, sessions]);

  return null;
}
