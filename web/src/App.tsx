import { lazy, Suspense } from 'react';
import { brand } from '@brand';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { useMenuAction, useNativeMenuBridge } from '@/tauri/menu-actions';
import { WorkspacePage } from '@/routes/workspace-page';
import { DesktopTitleBar } from '@/components/clio/desktop-title-bar';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { scheduleBackgroundUpdateCheck } from '@/tauri/desktop-updater';
import { openExternalUrlOrToast } from '@/tauri/external-url';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useProviderCatalog } from '@/hooks/use-provider-catalog';
import { UpdateRestartOverlay } from '@/components/clio/update-restart-overlay';
import { UpdateRestartRecovery } from '@/components/clio/update-restart-recovery';

const ConnectionPage = lazy(() =>
  import('@/routes/connection-page').then((module) => ({ default: module.ConnectionPage })),
);
const RunsPage = lazy(() =>
  import('@/routes/runs-page').then((module) => ({ default: module.RunsPage })),
);
const InfrastructurePage = lazy(() =>
  import('@/routes/infrastructure-page').then((module) => ({
    default: module.InfrastructurePage,
  })),
);
const SettingsPage = lazy(() =>
  import('@/routes/settings-page').then((module) => ({ default: module.SettingsPage })),
);
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

export default function App() {
  const navigate = useNavigate();
  const desktopHost = inTauri();
  const { credentialsReady } = useConnectionSettings();
  useNativeMenuBridge();
  useEffect(() => {
    // "Connected" here means the boot-time connection resolution (managed
    // backend wait, or the immediate ready state for a manual/browser
    // connection) has finished — not tied to any one workspace route, so it
    // survives navigating between sessions without rescheduling. The checker
    // itself is a no-op outside the installed app.
    if (!desktopHost || !credentialsReady) return;
    return scheduleBackgroundUpdateCheck();
  }, [credentialsReady, desktopHost]);
  useMenuAction('open-settings', () => navigate('/settings/appearance'));
  useMenuAction('manage-agent-services', () => navigate('/?intent=connect&mode=deploy'));
  useMenuAction('about', () => navigate('/settings/about'));
  useMenuAction('help-docs', () => {
    if (brand.homeUrl) openExternalUrlOrToast(brand.homeUrl);
    else navigate('/settings/about');
  });
  useEffect(() => {
    // Title comes from index.html's brand-driven <title> (vite-plugin-brand.ts's
    // transformIndexHtml) now, not a runtime patch here — no route in this
    // app currently overrides it with a session-specific title.
    for (const [token, value] of Object.entries(brand.themeTokens)) {
      document.documentElement.style.setProperty(token, value);
    }
    if (brand.accent) {
      document.documentElement.style.setProperty('--brand-accent', brand.accent);
      document.documentElement.style.setProperty('--action', brand.accent);
    }
  }, []);

  const appContent = (
    <>
      <ProviderCatalogWarmup />
      <UpdateRestartRecovery />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
          <Route element={<WorkspacePage />} path="/workspaces/:workspaceId/sessions/:sessionId" />
          <Route element={<RunsPage />} path="/runs" />
          <Route element={<InfrastructurePage />} path="/infrastructure/:section?" />
          <Route element={<SettingsPage />} path="/settings/:section" />
          <Route element={<UnknownRouteRedirect />} path="*" />
        </Routes>
      </Suspense>
      <Toaster closeButton richColors />
      {/* Fixed + full-viewport, so it covers the desktop title bar's own
          connection pill too -- not just the routed content below. */}
      <UpdateRestartOverlay />
    </>
  );

  if (!desktopHost) return appContent;
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
      <DesktopTitleBar />
      <div className="desktop-content min-h-0 flex-1 overflow-hidden">{appContent}</div>
    </div>
  );
}
