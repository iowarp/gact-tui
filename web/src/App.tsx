import { lazy, memo, Suspense, useState, type ComponentType, type ReactNode } from 'react';
import { brand } from '@brand';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useLocation, type Location } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { useMenuAction, useNativeMenuBridge } from '@/tauri/menu-actions';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { WorkspacePage } from '@/routes/workspace-page';
import { NewConversationPage } from '@/routes/new-conversation-page';
import { DesktopTitleBar } from '@/components/clio/desktop-title-bar';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { scheduleBackgroundUpdateCheck } from '@/tauri/desktop-updater';
import { openExternalUrlOrToast } from '@/tauri/external-url';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useProviderCatalog } from '@/hooks/use-provider-catalog';
import { ClioSelectionActionToolbar } from '@/components/clio/selection-actions';
import { UpdateRestartOverlay } from '@/components/clio/update-restart-overlay';
import { UpdateRestartRecovery } from '@/components/clio/update-restart-recovery';
import { returnRouteFromState } from '@/lib/workspace-route-memory';
import { isSettingsRoute, settingsBackgroundRoute } from '@/lib/settings-window-route';
import { SandboxSetupNotification } from '@/components/clio/sandbox-setup-notification';
import { McpOAuthReturn } from '@/routes/mcp-oauth-return';
import { SettingsWindow } from '@/routes/settings-window';
import {
  installRoutePrefetch,
  loadedRouteChunk,
  loadRouteChunk,
  type RouteChunk,
  type RouteModule,
} from '@/lib/route-chunks';

// Desktop only, and it carries the bundled changelog and its markdown renderer.
const WhatsNewDialog = lazy(() =>
  import('@/components/clio/whats-new-dialog').then((module) => ({
    default: module.WhatsNewDialog,
  })),
);
/**
 * A lazily loaded route that renders synchronously once its module is loaded.
 * `lazy` alone suspends on every first mount, and React then holds the reveal
 * for its 300 ms fallback throttle even when the chunk was prefetched. The
 * component is chosen once per mount so a page never remounts mid-visit.
 */
function lazyRoute<Name extends RouteChunk>(
  name: Name,
  pick: (module: RouteModule<Name>) => ComponentType,
): ComponentType {
  const Lazy = lazy(() => loadRouteChunk(name).then((module) => ({ default: pick(module) })));
  return function LazyRoute() {
    const [Page] = useState<ComponentType>(() => {
      const module = loadedRouteChunk(name);
      return module ? pick(module) : Lazy;
    });
    return <Page />;
  };
}

const ConnectionPage = lazyRoute('connection', (module) => module.ConnectionPage);
const RunsPage = lazyRoute('runs', (module) => module.RunsPage);
const InfrastructurePage = lazyRoute('infrastructure', (module) => module.InfrastructurePage);

function RouteFallback() {
  return (
    <main
      aria-label={`Loading ${brand.name}`}
      className="grid h-full min-h-0 place-items-center bg-background p-8"
    >
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
        <p className="text-sm text-muted-foreground">Loading workspace…</p>
      </div>
    </main>
  );
}

function UnknownRouteRedirect() {
  return <Navigate replace to="/" />;
}

function ProviderCatalogWarmup() {
  useProviderCatalog();
  return null;
}

/** The app's own routes, re-rendered only when the location they show changes. */
const BackgroundRoutes = memo(
  function BackgroundRoutes({ location, children }: { location: Location; children: ReactNode }) {
    return <Routes location={location}>{children}</Routes>;
  },
  (previous, next) => previous.location === next.location,
);

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const desktopHost = inTauri();
  const { credentialsReady, settings } = useConnectionSettings();
  const settingsReturnState = {
    endpoint: settings.endpoint,
    from: location.pathname.startsWith('/workspaces/')
      ? location.pathname
      : returnRouteFromState(location.state, settings.endpoint),
  };
  const settingsBackground = settingsBackgroundRoute(location, settings.endpoint);
  // While Settings is open the page behind it keeps its last location object,
  // so moving between settings sections never re-renders the workspace.
  const [behindSettings, setBehindSettings] = useState<Location>(location);
  const routesLocation = settingsBackground
    ? behindSettings.pathname === settingsBackground
      ? behindSettings
      : { ...location, pathname: settingsBackground, search: '', hash: '' }
    : location;
  if (routesLocation !== behindSettings) setBehindSettings(routesLocation);
  useNativeMenuBridge();
  // Secondary routes load on idle or link hover, not on their first visit.
  useEffect(() => installRoutePrefetch(), []);
  useEffect(() => {
    // "Connected" here means the boot-time connection resolution (managed
    // backend wait, or the immediate ready state for a manual/browser
    // connection) has finished — not tied to any one workspace route, so it
    // survives navigating between sessions without rescheduling. The checker
    // itself is a no-op outside the installed app.
    if (!desktopHost || !credentialsReady) return;
    return scheduleBackgroundUpdateCheck();
  }, [credentialsReady, desktopHost]);
  useMenuAction('open-settings', () =>
    navigate('/settings/general', {
      state: settingsReturnState,
    }),
  );
  useMenuAction('manage-agent-services', () => navigate('/?intent=connect&mode=deploy'));
  useShortcut('infrastructure', () => navigate('/infrastructure', { state: settingsReturnState }));
  useMenuAction('about', () => navigate('/settings/about', { state: settingsReturnState }));
  useMenuAction('help-docs', () => {
    if (brand.homeUrl) openExternalUrlOrToast(brand.homeUrl);
    else navigate('/settings/about', { state: settingsReturnState });
  });

  if (location.pathname === '/oauth/mcp') return <McpOAuthReturn />;

  const appContent = (
    <>
      <ProviderCatalogWarmup />
      <SandboxSetupNotification />
      <UpdateRestartRecovery />
      <Suspense fallback={<RouteFallback />}>
        <BackgroundRoutes location={routesLocation}>
          <Route element={<ConnectionPage />} path="/" />
          <Route element={<WorkspacePage />} path="/workspaces/:workspaceId/sessions/:sessionId" />
          <Route element={<NewConversationPage />} path="/workspaces/:workspaceId/new" />
          <Route element={<RunsPage />} path="/runs" />
          <Route element={<InfrastructurePage />} path="/infrastructure/:section?" />
          {/* Settings is a window over the app; without a workspace behind it the
              app area stays empty. */}
          <Route element={<div className="h-full bg-background" />} path="/settings/:section" />
          <Route element={<McpOAuthReturn />} path="/oauth/mcp" />
          <Route element={<UnknownRouteRedirect />} path="*" />
        </BackgroundRoutes>
      </Suspense>
      {isSettingsRoute(location.pathname) ? (
        <Routes>
          <Route element={<SettingsWindow />} path="/settings/:section" />
        </Routes>
      ) : null}
      <Toaster closeButton richColors />
      {/* Fixed + full-viewport, so it covers the desktop title bar's own
          connection pill too -- not just the routed content below. */}
      <UpdateRestartOverlay />
      {/* One toolbar for every selectable surface; actions register per page. */}
      <ClioSelectionActionToolbar />
    </>
  );

  if (!desktopHost) return appContent;
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <DesktopTitleBar />
      <div className="desktop-content min-h-0 flex-1 overflow-hidden">{appContent}</div>
      <Suspense fallback={null}>
        <WhatsNewDialog />
      </Suspense>
    </div>
  );
}
