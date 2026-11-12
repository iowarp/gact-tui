import type { Session } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { playAttentionSound } from '@/lib/attention-sound';
import { markConversationSeen } from '@/lib/notification-reads';
import { queryKeys } from '@/lib/query-keys';
import { ATTENTION_NOTICE_THROTTLE_MS, WAITING_SESSIONS_POLL_MS } from '@/lib/runtime-limits';
import { type SessionAttention, sessionAttentionIds } from '@/lib/session-attention';
import { sessionPath } from './session-path';
import {
  listenForNotificationOpen,
  notificationPermission,
  setAttentionBadge,
  showSystemNotice,
  type SystemNoticeResult,
} from '@/lib/system-notifications';
import {
  notificationAskAnswered,
  rememberNotificationAsk,
  setNotificationAskPending,
} from '@/lib/notification-ask';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  type AttentionSoundMode,
  useNotificationPreferences,
} from '@/providers/notification-preferences-provider';
import { useOnboardingTour } from '@/lib/onboarding/tour-context';

interface NotifierProps {
  activeSessionId: string;
  attentions: Readonly<Record<string, SessionAttention>>;
  sessions: readonly Session[];
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

export function ClioAttentionNotifier({ activeSessionId, attentions, sessions }: NotifierProps) {
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

  // The first-run tour goes first; the ask waits until it ends.
  const { holdPrompts } = useOnboardingTour();
  useAskForNotifications((desktopNotifications || finishedWork === 'desktop') && !holdPrompts);

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
    // The watched set follows the run-state ref this effect owns, so it updates here.
    // oxlint-disable-next-line react/set-state-in-effect
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

/**
 * Raises the first-run ask, once, whether the person wants system notices. It waits in
 * the bell (it still needs them), never in a toast over the transcript.
 */
function useAskForNotifications(wanted: boolean) {
  useEffect(() => {
    if (!wanted || notificationAskAnswered()) return;
    let cancelled = false;
    void notificationPermission().then((permission) => {
      if (cancelled) return;
      if (permission !== 'default') {
        rememberNotificationAsk();
        return;
      }
      setNotificationAskPending(true);
    });
    return () => {
      cancelled = true;
      // Withdrawn (the tour started), not answered: ask again afterwards.
      setNotificationAskPending(false);
    };
  }, [wanted]);
}
