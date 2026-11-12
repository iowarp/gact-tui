import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { WindowShell } from '@/components/clio/primitives/dialog-frame';
import { FrameClioMenu } from '@/components/clio/frame-clio-menu';
import { StateView } from '@/components/clio/primitives/state-view';
import { AnnounceStates } from '@/components/clio/settings-a11y';
import { SettingsNavRail } from '@/components/clio/settings-nav-rail';
import {
  SettingsNavigation,
  SettingsQueryField,
  SettingsSearchButton,
  SettingsSectionPicker,
} from '@/components/clio/settings-navigation';
import { SettingsResults } from '@/components/clio/settings-results';
import { useRepository } from '@/hooks/use-repository';
import { useSettingsAgentName } from '@/hooks/use-settings-agent-name';
import { useSettingsWorkspaceName } from '@/hooks/use-settings-workspace-name';
import { useUnavailableSettingsSections } from '@/hooks/use-unavailable-settings-sections';
import { settingsDestinations } from '@/lib/application-destinations';
import { connectionScope } from '@/lib/connection-scope';
import { SettingsWindowIcon } from '@/lib/icon-vocabulary';
import { loadedRouteChunk, loadRouteChunk } from '@/lib/route-chunks';
import { type SettingsScope, SettingsScopeContext } from '@/lib/settings-scope-context';
import { SettingsWindowCloseContext } from '@/lib/settings-window-close';
import {
  arrivedFromSearch,
  historyIndex,
  settingsBackgroundRoute,
  settingsCloseStep,
  withoutSearchArrival,
} from '@/lib/settings-window-route';
import { settingFromHash } from '@/lib/settings-search-rows';
import { settingsSearchResults } from '@/lib/settings-search-results';
import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';

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

/** Sections load lazily: the shared inline loading line where the page will be. */
function SectionsLoading() {
  return <StateView kind="loading" size="row" title="Loading settings…" />;
}

export function SettingsWindow() {
  const { section = 'general' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useConnectionSettings();
  // The history entry the window opened on; closing goes back past it.
  const [openedAt] = useState(historyIndex);
  const destinations = settingsDestinations(inTauri());
  const repository = useRepository();
  const memory = useQuery({
    queryKey: ['memory', 'summary'],
    queryFn: ({ signal }) => repository.memorySummary(signal),
    refetchInterval: 60_000,
    retry: false,
  });
  const inbox = memory.data?.inbox ?? 0;
  const unavailable = useUnavailableSettingsSections();
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
  // `?q=` is the filtered window (Ctrl ? from the global search): its field stays
  // while the query is edited, even empty, until Esc clears it.
  const searching = searchParams.has('q');
  const filter = searchParams.get('q') ?? '';
  const results = settingsSearchResults(destinations, filter);
  const showResults = searching && Boolean(filter.trim());
  // Clearing the field hands focus to the search button, so a second Esc closes.
  const [cleared, setCleared] = useState(false);
  // Without the workspace behind the window, section links keep it detached:
  // a remembered route can be stale and must not mount under Settings.
  const linkState = background
    ? withoutSearchArrival(location.state)
    : { endpoint: settings.endpoint, from: workspaceRoute, detached: true };
  const fromSearch = arrivedFromSearch(location.state);
  const workspaceId = workspaceIdFromRoute(workspaceRoute);
  const sessionId = sessionIdFromRoute(workspaceRoute);
  const workspaceName = useSettingsWorkspaceName(workspaceId);
  const agentName = useSettingsAgentName();
  const destination = destinations.find((item) => item.id === section);
  const scopeLabels = { App: 'App', Workspace: workspaceName.label, Agent: agentName };
  const scopeLine: SettingsScope = {
    group:
      destination?.group === 'Agent' || destination?.group === 'Workspace'
        ? destination.group
        : 'App',
    line:
      destination?.group === 'Agent'
        ? `${agentName}, applies to every conversation on this agent`
        : destination?.group === 'Workspace'
          ? workspaceName.line
          : 'App, applies to this computer',
    place: scopeLabels[destination?.group as keyof typeof scopeLabels] ?? 'App',
  };
  useEffect(() => {
    if (!sectionsLoaded || showResults) return;
    const scroller = content.current;
    const anchor = destination?.host
      ? scroller?.querySelector(`[data-settings-anchor="${section}"]`)
      : undefined;
    if (!scroller || !anchor) {
      scroller?.scrollTo({ left: 0, top: 0 });
      return;
    }
    anchor.scrollIntoView({ block: 'start' });
    // The host page above the anchor (Models above Helper models) is still
    // loading and grows, pushing the anchor down: keep it at the top until the
    // page settles or the person scrolls themselves.
    const observer = new ResizeObserver(() => anchor.scrollIntoView({ block: 'start' }));
    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const)
        scroller.removeEventListener(type, stop);
    };
    const timer = window.setTimeout(stop, 30_000);
    for (const child of Array.from(scroller.children)) observer.observe(child);
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const)
      scroller.addEventListener(type, stop, { passive: true });
    return stop;
  }, [section, destination?.host, sectionsLoaded, showResults]);
  useEffect(() => {
    if (!fromSearch || !sectionsLoaded || showResults) return;
    const setting = settingFromHash(location.hash);
    let target: Element | null | undefined;
    let done: number | undefined;
    const mark = (element: Element) => {
      target = element;
      element.classList.add('clio-search-arrival');
      done = window.setTimeout(() => element.classList.remove('clio-search-arrival'), 2000);
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
        // The spec's arrival keeps focus on the row's control, ring and all.
        // A choice's radios are all tabindex -1 until focused, so take its checked one.
        const control = row.querySelector('[data-slot="settings-control"]');
        (
          control?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
          control?.querySelector<HTMLElement>(
            ':is(button, input, select, textarea, [role="combobox"], [role="switch"]):not(:disabled, [aria-hidden="true"], [tabindex="-1"])',
          )
        )?.focus({ preventScroll: true });
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
  }, [
    fromSearch,
    section,
    destination?.host,
    location.key,
    location.hash,
    sectionsLoaded,
    showResults,
  ]);
  if (section === 'desktop') {
    return <Navigate replace to={`/settings/general${location.search}`} state={location.state} />;
  }
  const setQuery = (query: string) =>
    void navigate(
      { pathname: location.pathname, search: `?q=${encodeURIComponent(query)}` },
      { replace: true, state: withoutSearchArrival(location.state) },
    );
  const clearQuery = () => {
    setCleared(true);
    void navigate(
      { pathname: location.pathname, hash: location.hash },
      { replace: true, state: withoutSearchArrival(location.state) },
    );
  };
  const navigation = {
    sections: destinations,
    section,
    linkState,
    scopeLabels,
    badges: { memory: { count: inbox, label: `${inbox} memory changes waiting for review` } },
    unavailable,
    counts: showResults ? results.counts : undefined,
    onClearFilter: clearQuery,
  };
  const page = (id: string) => (
    <SettingsSection
      key={connectionScope(settings)}
      section={id}
      sessionId={sessionId}
      workspaceId={workspaceId}
    />
  );
  const close = () => {
    const step = settingsCloseStep(openedAt, historyIndex());
    if (step !== undefined) void navigate(step);
    else void navigate(background ?? workspaceRoute, { replace: true });
  };
  return (
    <WindowShell
      className="h-[min(calc(100dvh-2rem),60rem)] w-[min(calc(100vw-2rem),82rem)] min-[1024px]:h-[min(88dvh,60rem)] min-[1024px]:w-[min(88vw,82rem)]"
      contentLabel="Settings content"
      contentRef={content}
      icon={<SettingsWindowIcon />}
      navigation={<SettingsNavigation {...navigation} />}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      open
      picker={<SettingsSectionPicker {...navigation} />}
      rail={<SettingsNavRail {...navigation} />}
      search={
        searching ? (
          <SettingsQueryField
            count={results.total}
            onChange={setQuery}
            onClear={clearQuery}
            query={filter}
          />
        ) : (
          <SettingsSearchButton autoFocus={cleared} />
        )
      }
      title="Settings"
    >
      {/* Alt Space over Settings: the CLIO menu from the window's top-left (DialogContent is fixed). */}
      <FrameClioMenu className="top-12 left-3" />
      <main className="px-5 pt-4 pb-5 sm:px-7">
        <AnnounceStates />
        <div className="pb-12">
          <SettingsScopeContext.Provider value={scopeLine}>
            <SettingsWindowCloseContext.Provider value={close}>
              <Suspense fallback={<SectionsLoading />}>
                {showResults ? (
                  <SettingsResults
                    onClear={clearQuery}
                    onOpen={(id) =>
                      void navigate(`/settings/${id}`, { replace: true, state: linkState })
                    }
                    query={filter}
                    renderSection={page}
                    results={results}
                    scopeLabels={scopeLabels}
                  />
                ) : (
                  page(section)
                )}
                {sectionsLoaded ? null : <SectionsLoaded onLoaded={markSectionsLoaded} />}
              </Suspense>
            </SettingsWindowCloseContext.Provider>
          </SettingsScopeContext.Provider>
        </div>
      </main>
    </WindowShell>
  );
}
