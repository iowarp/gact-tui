import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { MemoryRouter } from 'react-router-dom';
import { managedServiceDefinitionSchema } from '@clio/core/v3';
import '../../src/index.css';
import definition from './llama-runtime-definition.json';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { createRepository } from '../../src/lib/connection';
import { ManagedServiceCard } from '../../src/components/clio/service-management-panel';

const initial = managedServiceDefinitionSchema.parse(definition);
const repository = {
  ...createRepository({ endpoint: 'https://fixture.invalid' }),
  previewContextSizing: async (): Promise<never> => {
    throw new Error('This review fixture does not read model files.');
  },
};
function Review() {
  const [service, setService] = useState(initial);
  const [configuration, setConfiguration] = useState<Record<string, string>>({});
  const [variant, setVariant] = useState(initial.recommended_variant);
  const [action, setAction] = useState('');
  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-6 bg-background p-5 text-foreground">
      <p className="text-xs text-muted-foreground">
        Production controls. Fixture installation completion. No model is loaded.
      </p>
      <ManagedServiceCard
        service={service}
        configuration={configuration}
        variant={variant}
        hostLabel="this computer"
        onVariant={setVariant}
        onConfiguration={(key, value) => setConfiguration((prior) => ({ ...prior, [key]: value }))}
        onAction={(value) => {
          setAction(
            value === 'start'
              ? `Start requested for ${configuration.model_path || configuration.hf_model}. No inference in this fixture.`
              : value,
          );
          if (value === 'install')
            setService({
              ...initial,
              state: 'stopped',
              observation: {
                phase: 'stopped',
                installed: true,
                running: false,
                serving: false,
                worker_alive: false,
                provenance_ingesting: false,
                attention_verified: false,
                definition_version: '1',
                configuration_revision: '',
                evidence_directory: '',
                effective_artifacts: {},
                observed_at: Date.now() / 1000,
              },
            });
        }}
      />
      {action ? (
        <p role="status" className="text-sm">
          {action}
        </p>
      ) : null}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repository}>
        <ForcedTheme theme="light">
          <AppearanceProvider>
            <MemoryRouter>
              <Review />
            </MemoryRouter>
          </AppearanceProvider>
        </ForcedTheme>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
