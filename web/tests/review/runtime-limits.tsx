import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { agentDefinitionSchema } from '@clio/core/v3';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { RuntimeSettingsPanel } from '../../src/components/clio/settings-runtime';
import { AgentEditorDialog } from '../../src/components/clio/agent-editor-dialog';
import { Button } from '../../src/components/ui/button';
import { createRepository } from '../../src/lib/connection';

const repository = createRepository({ endpoint: location.origin });
const initialAgent = agentDefinitionSchema.parse({
  id: 'reviewer',
  title: 'Reviewer',
  source: 'user',
  system_prompt: 'Review evidence.',
  fanout: { enabled: true, max_workers: 2 },
});

function Review() {
  const [editing, setEditing] = useState(false);
  const [agent, setAgent] = useState(initialAgent);
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-4xl content-start gap-6 bg-background px-5 py-6 text-foreground">
      <p className="text-xs text-muted-foreground">
        Simulated settings data with production CLIO controls. No inference.
      </p>
      <RuntimeSettingsPanel />
      <Button variant="outline" onClick={() => setEditing(true)}>
        Edit Reviewer
      </Button>
      {editing ? (
        <AgentEditorDialog
          agent={agent}
          tools={[]}
          onClose={() => setEditing(false)}
          onSave={async (value) => {
            setAgent(await repository.updateAgent(value.id, value));
            setEditing(false);
          }}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repository}>
        <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
          <AppearanceProvider>
            <Review />
          </AppearanceProvider>
        </ThemeProvider>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
