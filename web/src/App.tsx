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
      className="grid min-h-svh place-items-center bg-background p-8"
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

export default function App() {
  const navigate = useNavigate();
  const desktopHost = inTauri();
  useNativeMenuBridge();
  useMenuAction('open-settings', () => navigate('/settings/appearance'));
  useMenuAction('about', () => navigate('/settings/about'));
  useMenuAction('help-docs', () => {
    if (brand.homeUrl) window.open(brand.homeUrl, '_blank', 'noopener,noreferrer');
    else navigate('/settings/about');
  });
  useEffect(() => {
    document.title = brand.name;
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
