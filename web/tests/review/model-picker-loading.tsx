import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { MemoryRouter } from 'react-router-dom';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { createRepository } from '../../src/lib/connection';
import { queryKeys } from '../../src/lib/query-keys';
import type { ClioModelOption } from '../../src/lib/model-options';
import { ClioModelPicker } from '../../src/components/clio/model-picker';
import { Button } from '../../src/components/ui/button';

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
client.setQueryData(queryKeys.key('language-model-configuration', 'https://archive.invalid'), {
  configured: true,
  provider_id: 'amsc_mag',
  provider: 'openai',
  presets: [],
});

export function Review() {
  const [count, setCount] = useState(1369);
  const [provider, setProvider] = useState('amsc_mag');
  const [networkLoading, setNetworkLoading] = useState(false);
  const [selection, setSelection] = useState('None');
  const events = useRef<object[]>([]);
  const receipt = useRef<HTMLPreElement>(null);
  const options = useMemo<ClioModelOption[]>(
    () =>
      Array.from({ length: count }, (_, index) => ({
        id: `synthetic/model-${String(index).padStart(4, '0')}`,
        label: `Model ${String(index).padStart(4, '0')}`,
        available: true,
        health: 'ready',
        modalities: ['text', 'image'],
        toolCalling: true,
        providerId: provider,
        providerName: provider === 'amsc_mag' ? 'AmSC Model Access Gateway' : 'OpenRouter',
        contextWindow: 128_000 + (index % 10) * 100_000,
      })),
    [count, provider],
  );

  // DOM-only observations of the production picker. No scheduler overrides,
  // artificial preparation delay, credentials or provider requests.
  useEffect(() => {
    let sawSkeleton = false;
    let sawReady = false;
    const log = (event: string, detail: object = {}) => {
      events.current.push({ event, at: performance.now(), ...detail });
      if (receipt.current) receipt.current.textContent = JSON.stringify(events.current, null, 2);
    };
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) {
        sawSkeleton = false;
        sawReady = false;
        return;
      }
      const skeleton = dialog.querySelector<HTMLElement>('[aria-busy="true"]');
      if (skeleton && !sawSkeleton) {
        sawSkeleton = true;
        log('skeleton-commit', {
          label: skeleton.textContent?.trim(),
          providerVisible: dialog.textContent?.includes('AmSC Model Access Gateway'),
          searchVisible: Boolean(dialog.querySelector('[data-slot="cascader-input"]')),
        });
        requestAnimationFrame((frame) => {
          log('first-frame', {
            frame,
            skeletonVisible: skeleton.isConnected && skeleton.getBoundingClientRect().height > 0,
          });
          requestAnimationFrame((nextFrame) => {
            log('next-frame', {
              frame: nextFrame,
              skeletonVisible: skeleton.isConnected && skeleton.getBoundingClientRect().height > 0,
            });
          });
        });
      }
      if (!skeleton && dialog.querySelector('[data-slot="cascader-panel"]') && !sawReady) {
        sawReady = true;
        log('catalog-ready', { rows: count });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [count]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-5 text-foreground">
      <h1 className="text-xl font-medium">Model picker loading review</h1>
      <p className="max-w-lg text-center text-sm text-muted-foreground">
        Production picker with synthetic model rows. No provider requests or inference.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <label>
          Provider{' '}
          <select
            aria-label="Provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            <option value="amsc_mag">AmSC</option>
            <option value="openrouter">OpenRouter</option>
          </select>
        </label>
        <label>
          Catalog size{' '}
          <select
            aria-label="Catalog size"
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          >
            <option value={1369}>1,369 models</option>
            <option value={5000}>5,000 models</option>
            <option value={20}>20 models</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={networkLoading}
          onChange={(event) => setNetworkLoading(event.target.checked)}
        />
        Hold network-loading state for screenshot review
      </label>
      <ClioModelPicker
        options={options}
        provider={provider}
        catalogStatus={networkLoading ? 'loading' : 'ready'}
        onChange={(choice) => setSelection(choice.id)}
        trigger={
          <Button
            onClick={() => {
              events.current = [{ event: 'click', at: performance.now(), rows: count }];
            }}
          >
            Choose a model
          </Button>
        }
      />
      <p className="text-sm">Selected: {selection}</p>
      <details className="max-w-full text-xs">
        <summary>Loading observations</summary>
        <pre className="max-w-full overflow-auto" id="timing-receipt" ref={receipt} />
      </details>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider
        value={createRepository({ endpoint: 'https://fixture.invalid' })}
      >
        <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
          <AppearanceProvider>
            <MemoryRouter>
              <Review />
            </MemoryRouter>
          </AppearanceProvider>
        </ThemeProvider>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
