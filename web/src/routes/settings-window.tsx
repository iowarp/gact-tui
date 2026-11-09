import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { WindowShell } from '@/components/clio/primitives/dialog-frame';
import { SettingsNavRail } from '@/components/clio/settings-nav-rail';
import {
  SettingsNavigation,
  SettingsSearchButton,
  SettingsSectionPicker,
} from '@/components/clio/settings-navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { settingsDestinations } from '@/lib/application-destinations';
import { vocab } from '@/lib/brand-vocabulary';
import { connectionScope } from '@/lib/connection-scope';
import { SettingsIcon } from '@/lib/icon-vocabulary';
import { isLoopbackAddress } from '@/lib/local-servers';
import { loadedRouteChunk, loadRouteChunk } from '@/lib/route-chunks';
import { type SettingsScope, SettingsScopeContext } from '@/lib/settings-scope-context';
import {
  arrivedFromSearch,
  settingsBackgroundRoute,
  withoutSearchArrival,
} from '@/lib/settings-window-route';
import { settingFromHash } from '@/lib/settings-search-rows';
import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

// Only the sections load lazily. The window itself mounts once, with the
// route, so a dialog opened over it (Ctrl K) is never covered by a window
// that finished loading later.
const LazySettingsSection = lazy(() =>
  loadRouteChunk('settings').then((module) => ({ default: module.SettingsSection })),
);

function SectionsLoaded({ onLoaded }: { onLoaded: () => void }) {
  useEffect(onLoaded, [onLoaded]);
  return null;
}

/** "CLIO local" for this computer's agent, "CLIO on gpu-01" for another. */
function agentPlaceName(endpoint: string): string {
  if (isLoopbackAddress(endpoint)) return `${vocab.agent} local`;
  try {
    return `${vocab.agent} on ${new URL(endpoint).hostname}`;
  } catch {
    return vocab.agent;
  }
}

function SectionsLoading() {
  return (
    <div aria-busy="true" className="space-y-3" role="status">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-24 w-full max-w-xl" />
      <p className="text-sm text-muted-foreground">Loading settings…</p>
    </div>
  );
}

export function SettingsWindow() {
  const { section = 'general' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useConnectionSettings();
  const destinations = settingsDestinations(inTauri());
  const repository = useRepository();
  const memory = useQuery({
    queryKey: ['memory', 'summary'],
    queryFn: ({ signal }) => repository.memorySummary(signal),
    refetchInterval: 60_000,
    retry: false,
  });
  const inbox = memory.data?.inbox ?? 0;
  const content = useRef<HTMLDivElement>(null);
  // A prefetched chunk renders at once; otherwise the section suspends.
  const [SettingsSection] = useState(
    () => loadedRouteChunk('settings')?.SettingsSection ?? LazySettingsSection,
  );
  const [sectionsLoaded, setSectionsLoaded] = useState(SettingsSection !== LazySettingsSection);
  const markSectionsLoaded = useCallback(() => setSectionsLoaded(true), []);
  const workspaceRoute = returnRouteFromState(location.state, settings.endpoint);
  const background = settingsBackgroundRoute(location, settings.endpoint);
  const [searchParams] = useSearchParams();
  const filter = searchParams.get('q') ?? '';
  // Without the workspace behind the window, section links keep it detached:
  // a remembered route can be stale and must not mount under Settings.
  const linkState = background
    ? withoutSearchArrival(location.state)
    : { endpoint: settings.endpoint, from: workspaceRoute, detached: true };
  const fromSearch = arrivedFromSearch(location.state);
  const workspaceId = workspaceIdFromRoute(workspaceRoute);
  const sessionId = sessionIdFromRoute(workspaceRoute);
  const workspace = useLiveStore((state) =>
    workspaceId ? state.entities.workspaces[workspaceId] : undefined,
  );
  const workspaceName = workspace?.display_name || workspace?.name || 'Workspace';
  const agentName = settings.label || agentPlaceName(settings.endpoint);
  const destination = destinations.find((item) => item.id === section);
  const scopeLabels = { App: 'App', Workspace: workspaceName, Agent: agentName };
  const scopeLine: SettingsScope = {
    group:
      destination?.group === 'Agent' || destination?.group === 'Workspace'
        ? destination.group
        : 'App',
    line:
      destination?.group === 'Agent'
        ? `${agentName}, applies to every conversation on this agent`
        : destination?.group === 'Workspace'
          ? `${workspaceName} on ${agentName}, kept for this workspace and for you`
          : 'App, applies to this computer',
  };
  useEffect(() => {
    if (!sectionsLoaded) return;
    const anchor = destination?.host
      ? content.current?.querySelector(`[data-settings-anchor="${section}"]`)
      : undefined;
    if (anchor) anchor.scrollIntoView({ block: 'start' });
    else content.current?.scrollTo({ left: 0, top: 0 });
  }, [section, destination?.host, sectionsLoaded]);
  useEffect(() => {
    if (!fromSearch || !sectionsLoaded) return;
    const setting = settingFromHash(location.hash);
    let target: Element | null | undefined;
    let done: number | undefined;
    const mark = (element: Element) => {
      target = element;
      element.classList.add('clio-search-arrival');
      done = window.setTimeout(() => element.classList.remove('clio-search-arrival'), 1600);
    };
    if (setting) {
      // A setting's row can wait on its section's data: look for it briefly.
      const started = Date.now();
      const find = () => content.current?.querySelector(`[data-setting="${CSS.escape(setting)}"]`);
      const poll = window.setInterval(() => {
        const row = find();
        if (row || Date.now() - started > 3000) window.clearInterval(poll);
        if (!row) return;
        row.scrollIntoView({ block: 'center' });
        mark(row);
      }, 100);
      return () => {
        window.clearInterval(poll);
        window.clearTimeout(done);
        target?.classList.remove('clio-search-arrival');
      };
    }
    const heading = destination?.host
      ? content.current?.querySelector(
          `[data-settings-anchor="${section}"] h2, [data-settings-anchor="${section}"] h1`,
        )
      : content.current?.querySelector('h1');
    if (!heading) return;
    mark(heading);
    return () => {
      window.clearTimeout(done);
      target?.classList.remove('clio-search-arrival');
    };
  }, [fromSearch, section, destination?.host, location.key, location.hash, sectionsLoaded]);
  if (section === 'desktop') {
    return <Navigate replace to={`/settings/general${location.search}`} state={location.state} />;
  }
  const navigation = {
    sections: destinations,
    section,
    linkState,
    scopeLabels,
    badges: { memory: { count: inbox, label: `${inbox} memory changes waiting for review` } },
    filter,
    onClearFilter: () =>
      void navigate(
        { pathname: location.pathname, hash: location.hash },
        { replace: true, state: withoutSearchArrival(location.state) },
      ),
  };
  return (
    <WindowShell
      className="h-[min(calc(100dvh-2rem),60rem)] w-[min(calc(100vw-2rem),82rem)] min-[1024px]:h-[min(88dvh,60rem)] min-[1024px]:w-[min(88vw,82rem)]"
      contentLabel="Settings content"
      contentRef={content}
      icon={<SettingsIcon />}
      navigation={<SettingsNavigation {...navigation} />}
      onOpenChange={(open) => {
        if (!open) void navigate(background ?? workspaceRoute);
      }}
      open
      rail={<SettingsNavRail {...navigation} />}
      search={<SettingsSearchButton />}
      title="Settings"
      toolbar={<SettingsSectionPicker {...navigation} />}
    >
      <main className="px-5 pt-4 pb-5 sm:px-7">
        <div className="pb-12">
          <SettingsScopeContext.Provider value={scopeLine}>
            <Suspense fallback={<SectionsLoading />}>
              <SettingsSection
                key={connectionScope(settings)}
                section={section}
                sessionId={sessionId}
                workspaceId={workspaceId}
              />
              {sectionsLoaded ? null : <SectionsLoaded onLoaded={markSectionsLoaded} />}
            </Suspense>
          </SettingsScopeContext.Provider>
        </div>
      </main>
    </WindowShell>
  );
}
