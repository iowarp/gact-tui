import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { StateView } from '@/components/clio/primitives/state-view';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import {
  newConversationRoute,
  returnRouteFromState,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { t } from '@lingui/core/macro';

/**
 * `/runs` and `/runs?run=<handle>`: Runs is a workbench tab, so a link to it
 * returns to the conversation the person was in (or a workspace's new
 * conversation) with the Runs tab open on that run.
 */
export function RunsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const remembered = returnRouteFromState(location.state, settings.endpoint);
  const known = workspaceIdFromRoute(remembered) ? remembered : undefined;
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
    enabled: !known,
  });
  const firstWorkspace = workspaces.data?.[0]?.id;
  const target = known ?? (firstWorkspace ? newConversationRoute(firstWorkspace) : undefined);
  const run = searchParams.get('run') ?? undefined;
  const scope = connectionScope(settings);
  const noWorkspace = !known && workspaces.isSuccess && !firstWorkspace;
  useEffect(() => {
    if (!target) return;
    void navigate(target, {
      replace: true,
      state: { globalSearchResource: { scope, request: { kind: 'runs', run } } },
    });
  }, [navigate, run, scope, target]);
  if (workspaces.isError)
    return (
      <StateView detail={workspaces.error.message} kind="error" title={t`Runs could not open`} />
    );
  if (noWorkspace)
    return (
      <StateView kind="empty" title={t`Runs open beside a conversation. Add a workspace first.`} />
    );
  return <StateView kind="loading" title={t`Opening Runs`} />;
}
