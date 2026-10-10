import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { FileChartColumnIcon } from 'lucide-react';
import type { DashboardReport } from '@clio/core/v3';
import '../../src/index.css';
import { ConnectionProvider, useConnectionSettings } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ClioMotionProvider } from '../../src/components/clio/motion';
import { DashboardResourceView } from '../../src/components/clio/dashboard-view';
import { FileViewerShell } from '../../src/components/clio/file-viewer-shell';
import { TooltipProvider } from '../../src/components/ui/tooltip';

function Review() {
  const { settings } = useConnectionSettings();
  const [saved, setSaved] = useState<{ report: DashboardReport; artifact_id: string }>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    void fetch(`${settings.endpoint}/__test/dashboard`)
      .then(async (response) => {
        if (!response.ok) throw new Error('The isolated dashboard review service is required.');
        setSaved(await response.json());
      })
      .catch((failure: unknown) => setError(String(failure)));
  }, [settings.endpoint]);
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <p className="border-b px-4 py-2 text-xs text-muted-foreground">
        Recorded Raccoon dashboard · current renderer · isolated export and capture service
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <main className="min-h-0 flex-1">
        {saved ? (
          <FileViewerShell
            source={{
              kind: 'workspace',
              workspaceId: 'ws_default',
              path: 'dashboard.json',
              mediaType: 'application/json',
            }}
            tabs={[
              {
                value: 'preview',
                label: 'Preview',
                icon: FileChartColumnIcon,
                content: (
                  <div className="h-full overflow-auto">
                    <DashboardResourceView
                      content={JSON.stringify(saved.report)}
                      artifactId={saved.artifact_id}
                    />
                  </div>
                ),
              },
            ]}
          />
        ) : null}
      </main>
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ConnectionProvider>
      <ThemeProvider
        attribute="class"
        forcedTheme={
          new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'
        }
        enableSystem={false}
      >
        <AppearanceProvider>
          <ClioMotionProvider>
            <TooltipProvider>
              <Review />
            </TooltipProvider>
          </ClioMotionProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </ConnectionProvider>
  </QueryClientProvider>,
);
