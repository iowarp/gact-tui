import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { MemoryRouter } from 'react-router-dom';
import { managedServiceDefinitionSchema } from '@clio/core/v3';
import '../../src/index.css';
import scenarios from './service-methods-catalog.json';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { createRepository } from '../../src/lib/connection';
import { ManagedServiceInventory } from '../../src/components/clio/managed-service-inventory';
import { ManagedServiceCard } from '../../src/components/clio/service-management-panel';

const repository = {
  ...createRepository({ endpoint: 'https://fixture.invalid' }),
  previewContextSizing: async (): Promise<never> => {
    throw new Error('No model or host probe in this fixture.');
  },
};
function Review() {
  const [index, setIndex] = useState(Number(new URLSearchParams(location.search).get('host') || 0));
  const [selected, setSelected] = useState('');
  const [deploying, setDeploying] = useState(true);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [configuration, setConfiguration] = useState<Record<string, string>>({});
  const scenario = scenarios[index]!;
  const services = scenario.services.map((row) => managedServiceDefinitionSchema.parse(row));
  return (
    <main className="mx-auto min-h-dvh max-w-4xl space-y-5 bg-background p-5 text-foreground">
      <p className="text-sm text-muted-foreground">
        Production components and production catalog. Simulated host facts; no installs or
        inference.
      </p>
      <label className="block">
        Review host{' '}
        <select
          aria-label="Review host"
          value={index}
          onChange={(event) => {
            setIndex(Number(event.target.value));
            setSelected('');
            setDeploying(true);
            setVariants({});
            setConfiguration({});
          }}
        >
          {scenarios.map((row, idx) => (
            <option key={row.label} value={idx}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <ManagedServiceInventory
        endpoint="https://fixture.invalid"
        targetId="review"
        hostLabel={scenario.label}
        services={services}
        selected={selected}
        onSelected={setSelected}
        deploying={deploying}
        onDeploying={setDeploying}
        operations={{}}
        loading={false}
        renderService={(service, setup) => (
          <ManagedServiceCard
            service={service}
            setup={setup}
            variant={variants[service.id] || service.recommended_variant}
            configuration={configuration}
            hostLabel={scenario.label}
            onVariant={(value) => setVariants((prior) => ({ ...prior, [service.id]: value }))}
            onConfiguration={(key, value) =>
              setConfiguration((prior) => ({ ...prior, [key]: value }))
            }
            onAction={() => undefined}
          />
        )}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repository}>
        <ForcedTheme
          theme={new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'}
        >
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
