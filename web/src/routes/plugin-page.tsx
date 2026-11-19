import { useLocation, useParams } from 'react-router-dom';
import { ClioAppShell } from '@/components/clio/app-shell';
import { PluginPageView } from '@/components/clio/plugin-page-view';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { StateView } from '@/components/clio/primitives/state-view';
import { RunsNavigation } from '@/components/clio/runs-navigation';
import { useRepository } from '@/hooks/use-repository';
import { usePluginPagesQuery } from '@/lib/a2ui/plugin-pages';
import { PluginTabIcon } from '@/lib/a2ui/plugin-tab-icons';
import { openPluginPage, usePluginPageState } from '@/lib/a2ui/plugin-tab-store';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { returnRouteFromState, workspaceIdFromRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ph, t } from '@lingui/core/macro';

function ReloadPage({ pageId, label }: { pageId: string; label: string }) {
  const repository = useRepository();
  const state = usePluginPageState(pageId);
  return (
    <IconButton
      disabled={state?.status === 'loading'}
      icon={<RefreshIcon />}
      label={t`Reload ${ph({ label })}`}
      onClick={() => void openPluginPage(repository, pageId)}
      size="sm"
      tooltipSide="bottom"
    />
  );
}

/**
 * A plugin's own page (`/plugins/:plugin/:page`), opened from its left-bar
 * entry: the left bar beside it, the plugin's surfaces filling the main area.
 */
export function PluginPageRoute() {
  const location = useLocation();
  const { settings } = useConnectionSettings();
  const { plugin = '', page: pageName = '' } = useParams();
  const pages = usePluginPagesQuery();
  const page = pages.data?.find((entry) => entry.plugin === plugin && entry.page === pageName);
  const workspaceId =
    workspaceIdFromRoute(returnRouteFromState(location.state, settings.endpoint)) ?? '';
  const label = page?.title ?? '';
  return (
    <ClioAppShell
      contextBar={
        <h1 className="flex min-w-0 items-center gap-1.5 text-ui font-semibold whitespace-nowrap text-foreground">
          {page ? (
            <PluginTabIcon className="size-3.5 shrink-0 text-muted-foreground" name={page.icon} />
          ) : null}
          <span className="min-w-0 truncate">{label}</span>
        </h1>
      }
      navigation={<RunsNavigation workspaceId={workspaceId} />}
      statusStrip={null}
      toolbarActions={page ? <ReloadPage label={label} pageId={page.id} /> : undefined}
      workbench={null}
    >
      {page ? (
        <PluginPageView key={page.id} page={page} />
      ) : pages.isPending ? (
        <StateView kind="loading" size="viewer" title={t`Opening the page`} />
      ) : (
        <StateView
          detail={t`The plugin that added this page may have been removed.`}
          kind="unavailable"
          size="viewer"
          title={t`This page is not available`}
        />
      )}
    </ClioAppShell>
  );
}
