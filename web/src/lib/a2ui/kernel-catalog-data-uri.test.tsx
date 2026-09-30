import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ readArtifactText: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const TEST_CATALOG_ID = 'test://kernel-catalog-data-uri';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [...KERNEL_COMPONENTS.values()],
  [...KERNEL_FUNCTIONS.values()],
);

function buildSurface(components: Record<string, unknown>[]) {
  const surfaceId = 'data-uri-surface';
  const processor = new MessageProcessor([testCatalog], async () => undefined, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: TEST_CATALOG_ID } },
    { version: 'v0.9.1', updateComponents: { surfaceId, components } },
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('clio.code.v1 dataUri', () => {
  it('renders the referenced file content as the source, code unchanged otherwise', async () => {
    repository.readArtifactText.mockResolvedValue("print('hello from a file')");
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['code'] },
      {
        id: 'code',
        component: 'clio.code.v1',
        dataUri: 'artifact://artifact_script01',
        language: 'python',
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/hello from a file/u)).toBeInTheDocument();
    expect(repository.readArtifactText).toHaveBeenCalledWith(
      'artifact_script01',
      undefined,
      expect.anything(),
    );
  });

  it('states a refusal instead of a blank code block', async () => {
    repository.readArtifactText.mockRejectedValue(new TransportError('gone', 404, 'not_found', {}));
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['code'] },
      {
        id: 'code',
        component: 'clio.code.v1',
        dataUri: 'artifact://artifact_missing01',
        language: 'python',
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/Code unavailable/u)).toBeInTheDocument();
  });
});

describe('clio.diff.v1 dataUri', () => {
  it('renders the referenced file content as the diff text', async () => {
    repository.readArtifactText.mockResolvedValue('@@ -1,1 +1,1 @@\n-old\n+new');
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['diff'] },
      {
        id: 'diff',
        component: 'clio.diff.v1',
        dataUri: 'artifact://artifact_patch01',
        path: 'src/model.py',
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/-old/u)).toBeInTheDocument();
    expect(repository.readArtifactText).toHaveBeenCalledWith(
      'artifact_patch01',
      undefined,
      expect.anything(),
    );
  });

  it('states a refusal instead of a blank diff', async () => {
    repository.readArtifactText.mockRejectedValue(new TransportError('gone', 404, 'not_found', {}));
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['diff'] },
      {
        id: 'diff',
        component: 'clio.diff.v1',
        dataUri: 'artifact://artifact_missing01',
        path: 'src/model.py',
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/Diff unavailable/u)).toBeInTheDocument();
  });
});
