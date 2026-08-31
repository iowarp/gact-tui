import { lazy, Suspense } from 'react';
import { brand } from '@brand';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster } from '@/components/ui/sonner';
import { useMenuAction, useNativeMenuBridge } from '@/tauri/menu-actions';
import { lastWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';

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
const WorkspacePage = lazy(() =>
  import('@/routes/workspace-page').then((module) => ({ default: module.WorkspacePage })),
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
  const { settings } = useConnectionSettings();
  const rememberedRoute = lastWorkspaceRoute(settings.endpoint);
  return <Navigate replace to={rememberedRoute} />;
}

export default function App() {
  const navigate = useNavigate();
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

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
          <Route element={<WorkspacePage />} path="/workspaces/:workspaceId/sessions/:sessionId" />
          <Route element={<RunsPage />} path="/runs" />
          <Route element={<InfrastructurePage />} path="/infrastructure" />
          <Route element={<SettingsPage />} path="/settings/:section" />
          <Route element={<UnknownRouteRedirect />} path="*" />
        </Routes>
      </Suspense>
      <Toaster closeButton richColors />
    </>
  );
}
