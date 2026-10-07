import type { ToolInvocation } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { PresentationNavigation } from '../../src/components/clio/presentation-navigation';
import { ClioToolInvocation } from '../../src/components/clio/tool-invocation';

const tool: ToolInvocation = await (await fetch('/__test/presentation-tool')).json();
const client = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <AppearanceProvider>
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, onOpenFile: () => {} }}
      >
        <main className="mx-auto max-w-3xl p-6">
          <h1 className="mb-4 text-sm text-muted-foreground">Shared tool result browser fixture</h1>
          <ClioToolInvocation tool={tool} />
        </main>
      </PresentationNavigation.Provider>
    </AppearanceProvider>
  </QueryClientProvider>,
);
