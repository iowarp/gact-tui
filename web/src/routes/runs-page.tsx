import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { ClioRepository, Session } from '@clio/core/v3';
import { StateView } from '@/components/clio/primitives/state-view';
import { useRepository } from '@/hooks/use-repository';
import {
  connectionCandidateSessions,
  connectionSessionRoute,
  latestConnectionSessionTarget,
} from '@/lib/connection-target';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import {
  newConversationRoute,
  returnRouteFromState,
  sessionIdFromRoute,
} from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { t } from '@lingui/core/macro';

/** How many of the newest tasks a deep link searches for its run's owner. */
const OWNER_SEARCH_PAGES = 4;

function conversationRoute(session: Session): string {
  return `/workspaces/${encodeURIComponent(session.workspace_id)}/sessions/${encodeURIComponent(session.id)}`;
}

/** The conversation a run belongs to, read from the session a link names or the task index. */
async function runOwnerSession(
  repository: Pick<ClioRepository, 'queryTasks' | 'sessionsById'>,
  run: string,
  sessionId: string | undefined,
  signal: AbortSignal,
): Promise<Session | null> {
  let ownerId = sessionId;
  let cursor: string | undefined;
  for (let page = 0; !ownerId && page < OWNER_SEARCH_PAGES; page += 1) {
    const tasks = await repository.queryTasks({ cursor, order: 'newest', limit: 100 }, signal);
    ownerId = tasks.tasks.find((task) => task.handle === run)?.owner.session_id;
    cursor = tasks.cursor ?? undefined;
    if (!cursor) break;
  }
  if (!ownerId) return null;
  const [owner] = await repository.sessionsById([ownerId], signal);
  // A plugin page's context session is not a conversation to land in.
  return owner && owner.session_kind !== 'page' && !owner.archived ? owner : null;
}

/**
 * `/runs` and `/runs?run=<handle>`: Runs is a workbench tab, so a link to it opens
 * beside a conversation with the Runs tab on that run. A run's link lands in the
 * run's own conversation; otherwise the one the person was in, or the most recent.
 * It never opens a new conversation while one exists.
 */
export function RunsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const run = searchParams.get('run') ?? undefined;
  const linkedSession = searchParams.get('session') ?? undefined;
  const remembered = returnRouteFromState(location.state, settings.endpoint);
  const owner = useQuery({
    queryKey: queryKeys.key('run-owner', settings.endpoint, run, linkedSession),
    queryFn: ({ signal }) => runOwnerSession(repository, run ?? '', linkedSession, signal),
    enabled: Boolean(run),
    retry: false,
  });
  const ownerSettled = !run || owner.isSuccess || owner.isError;
  const ownerSession = owner.data ?? undefined;
  const fallback = useQuery({
    queryKey: queryKeys.key('runs-landing', settings.endpoint, remembered),
    queryFn: async () => {
      const [workspaces, sessions] = await Promise.all([
        repository.workspaces(),
        connectionCandidateSessions(repository, remembered),
      ]);
      const rememberedId = sessionIdFromRoute(remembered);
      const rememberedSession = sessions.find(
        (session) => session.id === rememberedId && !session.archived,
      );
      if (rememberedSession && workspaces.some((item) => item.id === rememberedSession.workspace_id))
        return remembered;
      const latest = latestConnectionSessionTarget(workspaces, sessions);
      if (latest) return connectionSessionRoute(latest);
      return workspaces[0] ? newConversationRoute(workspaces[0].id) : null;
    },
    enabled: ownerSettled && !ownerSession,
    retry: false,
  });
  const target = ownerSession ? conversationRoute(ownerSession) : (fallback.data ?? undefined);
  const scope = connectionScope(settings);
  useEffect(() => {
    if (!target) return;
    void navigate(target, {
      replace: true,
      state: {
        globalSearchResource: {
          scope,
          request: { kind: 'runs', run, sessionId: linkedSession ?? ownerSession?.id },
        },
      },
    });
  }, [linkedSession, navigate, ownerSession?.id, run, scope, target]);
  if (fallback.isError)
    return <StateView detail={fallback.error.message} kind="error" title={t`Runs could not open`} />;
  if (fallback.isSuccess && fallback.data === null)
    return (
      <StateView kind="empty" title={t`Runs open beside a conversation. Add a workspace first.`} />
    );
  return <StateView kind="loading" title={t`Opening Runs`} />;
}
