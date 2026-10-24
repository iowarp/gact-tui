import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { RuntimeSettingsPanel } from '../../src/components/clio/settings-runtime';
import { createRepository } from '../../src/lib/connection';

const repository = createRepository({ endpoint: location.origin });

function Review() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-4xl content-start gap-6 bg-background px-5 py-6 text-foreground">
      <p className="text-xs text-muted-foreground">
        Simulated settings data with production CLIO controls. No inference.
      </p>
      <RuntimeSettingsPanel />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repository}>
        <ForcedTheme theme="light">
          <AppearanceProvider>
            <Review />
          </AppearanceProvider>
        </ForcedTheme>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
