import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { MemoryRouter } from 'react-router-dom';
import type { WorkspaceResource } from '@clio/core/v3';
import '../../src/index.css';
import { ClioComposer } from '../../src/components/clio/composer';
import { GeneralSettings } from '../../src/components/clio/settings-general';
import { WorkspaceResourceBrowser } from '../../src/components/clio/workspace-resource-browser';
import { WorkspaceResourceView } from '../../src/components/clio/workspace-resource-view';
import { Button } from '../../src/components/ui/button';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { createRepository } from '../../src/lib/connection';
import { queryKeys } from '../../src/lib/query-keys';
import { useSessionMutations } from '../../src/hooks/use-session-mutations';

const params = new URLSearchParams(location.search);
const workspaceId = params.get('workspaceId')!;
const sessionId = params.get('sessionId')!;
const repository = createRepository({ endpoint: params.get('endpoint')! });
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Review() {
  const [selected, setSelected] = useState<WorkspaceResource>();
  const [settings, showSettings] = useState(false);
  const resources = useQuery({
    queryKey: queryKeys.workspaceResources('https://archive.invalid', workspaceId),
    queryFn: ({ signal }) => repository.resources(workspaceId, signal),
  });
  const { prepareFiles, discardFiles, send } = useSessionMutations({
    sessionId,
    workspaceId,
    activeModel: 'gpt-6.1-sol',
    activeProvider: 'codex',
  });
  return (
    <main className="min-h-dvh bg-background p-6 text-foreground">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Pasted text as a source</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Production composer, Sources and settings against a private live CLIO server. Delivery
            queues into a paused session; no model runs.
          </p>
        </div>
        <Button variant="outline" onClick={() => showSettings(!settings)}>
          General settings
        </Button>
      </header>
      {settings ? (
        <GeneralSettings />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-6">
          <section className="min-w-0 rounded-xl border p-4" aria-label="Compose">
            <h2 className="mb-4 font-medium">Message</h2>
            <ClioComposer
              variant="welcome"
              attachments
              state="running"
              workspaceId={workspaceId}
              sessionId={sessionId}
              provider="codex"
              model="gpt-6.1-sol"
              onPrepareFiles={prepareFiles}
              onDiscardFiles={discardFiles}
              onSubmit={(value) => send.mutateAsync(value).then(() => undefined)}
              resources={resources.data}
            />
          </section>
          <section className="h-[700px] min-w-0 rounded-xl border p-4" aria-label="Sources">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium">Sources</h2>
              {selected ? (
                <Button variant="outline" onClick={() => setSelected(undefined)}>
                  Back to Sources
                </Button>
              ) : null}
            </div>
            <div className="h-[620px]">
              {selected ? (
                <WorkspaceResourceView workspaceId={workspaceId} resource={selected} />
              ) : (
                <WorkspaceResourceBrowser
                  workspaceId={workspaceId}
                  resources={resources.data ?? []}
                  onOpenResource={setSelected}
                />
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repository}>
        <AppearanceProvider>
          <MemoryRouter>
            <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
              <Review />
            </ThemeProvider>
          </MemoryRouter>
        </AppearanceProvider>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
