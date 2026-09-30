import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2uiSurface, Column, type ReactComponentImplementation } from '@a2ui/react/v0_9';
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
vi.mock('./mermaid-diagram', () => ({
  ClioMermaidDiagram: ({ source, title }: { source: string; title?: string }) => (
    <section aria-label={title || 'Diagram'}>{source}</section>
  ),
}));

import { ClioMermaidCatalogComponent, mermaidComponentSchema } from './a2ui-mermaid-catalog';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const TEST_CATALOG_ID = 'test://a2ui-mermaid-catalog';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [Column, ClioMermaidCatalogComponent] as ReactComponentImplementation[],
  [],
);

function buildSurface(components: Record<string, unknown>[]) {
  const surfaceId = 'mermaid-surface';
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

describe('clio.mermaid.v1 schema', () => {
  it('accepts inline source and refuses source together with dataUri', () => {
    const inline = mermaidComponentSchema.safeParse({ source: 'graph TD; A-->B;' });
    expect(inline.success).toBe(true);

    const both = mermaidComponentSchema.safeParse({
      source: 'graph TD; A-->B;',
      dataUri: 'artifact://artifact_diagram01',
    });
    expect(both.success).toBe(false);

    const neither = mermaidComponentSchema.safeParse({});
    expect(neither.success).toBe(false);
  });

  it('accepts a dataUri reference', () => {
    const result = mermaidComponentSchema.safeParse({ dataUri: 'artifact://artifact_diagram01' });
    expect(result.success).toBe(true);
  });
});

describe('clio.mermaid.v1 dataUri rendering', () => {
  it('renders the referenced file content as the diagram source', async () => {
    repository.readArtifactText.mockResolvedValue('flowchart LR\nA-->B');
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['diagram'] },
      {
        id: 'diagram',
        component: 'clio.mermaid.v1',
        dataUri: 'artifact://artifact_diagram01',
        title: 'Pipeline',
      },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/flowchart LR/u)).toBeInTheDocument();
    expect(repository.readArtifactText).toHaveBeenCalledWith(
      'artifact_diagram01',
      undefined,
      expect.anything(),
    );
  });

  it('states a refusal instead of a blank diagram', async () => {
    repository.readArtifactText.mockRejectedValue(new TransportError('gone', 404, 'not_found', {}));
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['diagram'] },
      { id: 'diagram', component: 'clio.mermaid.v1', dataUri: 'artifact://artifact_missing01' },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/Diagram unavailable/u)).toBeInTheDocument();
  });
});
