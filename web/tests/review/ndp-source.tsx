import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SourceProvider, WorkspaceReference } from '@clio/core/v3';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverrideProvider } from '../../src/providers/repository-override';
import { createRepository } from '../../src/lib/connection';
import { NDPSourcePicker } from '../../src/components/clio/ndp-source-picker';
import '../../src/index.css';

const repository = createRepository({ endpoint: location.origin, token: '' });
const client = new QueryClient();
const provider: SourceProvider = {
  id: 'ndp',
  name: 'National Data Platform',
  logo: 'ndp',
  authentication: 'browser',
  configured: true,
  authenticated: true,
  account_name: 'alice',
  setup_requirement: null,
  capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
};
function Review() {
  const [attached, setAttached] = useState<WorkspaceReference[]>([]);
  const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
  return (
    <ThemeProvider attribute="class" forcedTheme={theme}>
      <main className="min-h-dvh bg-background p-5 text-foreground">
        <div className="mx-auto max-w-2xl space-y-5">
          <p className="text-xs text-muted-foreground">
            NDP interface fixture. Catalog and account responses are intercepted; no protected NDP
            access is claimed.
          </p>
          <NDPSourcePicker
            workspaceId="workspace"
            provider={provider}
            onBack={() => undefined}
            onChanged={() => undefined}
            onSelect={(reference) => setAttached((rows) => [...rows, reference])}
          />
          {attached.map((reference) => (
            <p key={reference.id} role="status">
              Attached: {reference.label}
            </p>
          ))}
        </div>
      </main>
    </ThemeProvider>
  );
}
createRoot(document.getElementById('root')!).render(
  <ArchiveConnectionProvider>
    <RepositoryOverrideProvider repository={repository}>
      <QueryClientProvider client={client}>
        <Review />
      </QueryClientProvider>
    </RepositoryOverrideProvider>
  </ArchiveConnectionProvider>,
);
