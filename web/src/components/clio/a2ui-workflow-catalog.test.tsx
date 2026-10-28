import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2uiSurface, Column, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import { TransportError } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({ readArtifactText: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));
vi.mock('./mermaid-diagram', () => ({
  ClioMermaidDiagram: ({ source, title, interactiveNodes, selectedNodeIds, onNodeClick, referenceOverride }: {
    source: string;
    title?: string;
    interactiveNodes?: readonly { id: string; label: string }[];
    selectedNodeIds?: readonly string[];
    onNodeClick?: (id: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
    referenceOverride?: () => { query?: unknown };
  }) => (
    <section aria-label={title || 'Diagram'}>
      {source}
      {interactiveNodes?.map((node) => <button aria-label={`Pick ${node.label}`} key={node.id} onClick={(event) => onNodeClick?.(node.id, event)} type="button" />)}
      <output data-testid="selected-workflow-nodes" data-query={JSON.stringify(referenceOverride?.().query)}>{selectedNodeIds?.join(',')}</output>
    </section>
  ),
}));

import { ClioWorkflowCatalogComponent, workflowComponentSchema } from './a2ui-workflow-catalog';

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const TEST_CATALOG_ID = 'test://a2ui-workflow-catalog';
const testCatalog = new Catalog(
  TEST_CATALOG_ID,
  [Column, ClioWorkflowCatalogComponent] as ReactComponentImplementation[],
  [],
);

function buildSurface(
  components: Record<string, unknown>[],
  dataModel?: Record<string, unknown>,
  onAction: (action: { name: string }) => Promise<void> = async () => undefined,
) {
  const surfaceId = 'workflow-surface';
  const processor = new MessageProcessor([testCatalog], onAction as never, {
    version: 'v0.9.1',
  });
  processor.processMessages([
    { version: 'v0.9.1', createSurface: { surfaceId, catalogId: TEST_CATALOG_ID } },
    { version: 'v0.9.1', updateComponents: { surfaceId, components } },
    ...(dataModel
      ? [{ version: 'v0.9.1', updateDataModel: { surfaceId, path: '/', value: dataModel } }]
      : []),
  ] as A2uiMessage[]);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) throw new Error('Expected the test surface to exist');
  return surface;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('clio.workflow.v1 schema', () => {
  it('accepts inline nodes+edges and refuses them together with dataUri', () => {
    const inline = workflowComponentSchema.safeParse({
      nodes: [{ id: 'a', label: 'Acquire' }],
      edges: [],
    });
    expect(inline.success).toBe(true);

    const both = workflowComponentSchema.safeParse({
      nodes: [{ id: 'a', label: 'Acquire' }],
      edges: [],
      dataUri: 'artifact://artifact_workflow01',
    });
    expect(both.success).toBe(false);

    const neither = workflowComponentSchema.safeParse({});
    expect(neither.success).toBe(false);
  });

  it('requires both nodes and edges when given inline', () => {
    const nodesOnly = workflowComponentSchema.safeParse({ nodes: [{ id: 'a', label: 'Acquire' }] });
    expect(nodesOnly.success).toBe(false);
  });
});

describe('clio.workflow.v1 dataUri rendering', () => {
  it('selects a node natively and references only that step', () => {
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['workflow'] },
      { id: 'workflow', component: 'clio.workflow.v1', nodes: [
        { id: 'collect', label: 'Collect' }, { id: 'review', label: 'Review' },
      ], edges: [{ source: 'collect', target: 'review' }] },
    ]);
    render(wrap(<A2uiSurface surface={surface} />));

    fireEvent.click(screen.getByRole('button', { name: 'Pick Review' }));
    const selected = screen.getByTestId('selected-workflow-nodes');
    expect(selected).toHaveTextContent('review');
    expect(JSON.parse(selected.dataset.query ?? '{}')).toMatchObject({ selection: { field: 'id', values: ['review'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Pick Collect' }), { shiftKey: true });
    expect(selected).toHaveTextContent('review,collect');
  });

  it('parses the referenced {nodes, edges} JSON file and renders the graph', async () => {
    repository.readArtifactText.mockResolvedValue(
      JSON.stringify({
        nodes: [
          { id: 'fetch', label: 'Fetch' },
          { id: 'process', label: 'Process' },
        ],
        edges: [{ source: 'fetch', target: 'process' }],
      }),
    );
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['workflow'] },
      { id: 'workflow', component: 'clio.workflow.v1', dataUri: 'artifact://artifact_workflow01' },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByRole('button', { name: 'Pick Fetch' })).toBeInTheDocument();
    expect(repository.readArtifactText).toHaveBeenCalledWith(
      'artifact_workflow01',
      undefined,
      expect.anything(),
    );
  });

  it('states a refusal when the referenced file is not a valid {nodes, edges} shape', async () => {
    repository.readArtifactText.mockResolvedValue(JSON.stringify({ nope: true }));
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['workflow'] },
      { id: 'workflow', component: 'clio.workflow.v1', dataUri: 'artifact://artifact_workflow01' },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/Workflow unavailable/u)).toBeInTheDocument();
  });

  it('states an artifact-read refusal instead of a blank graph', async () => {
    repository.readArtifactText.mockRejectedValue(new TransportError('gone', 404, 'not_found', {}));
    const surface = buildSurface([
      { id: 'root', component: 'Column', children: ['workflow'] },
      { id: 'workflow', component: 'clio.workflow.v1', dataUri: 'artifact://artifact_missing01' },
    ]);

    render(wrap(<A2uiSurface surface={surface} />));

    expect(await screen.findByText(/Workflow unavailable/u)).toBeInTheDocument();
  });

  it("runs a node's own action on click and follows a bound selected node", async () => {
    const actions: string[] = [];
    const surface = buildSurface(
      [
        { id: 'root', component: 'Column', children: ['tree'] },
        {
          id: 'tree',
          component: 'clio.workflow.v1',
          nodes: [
            { id: 'root', label: 'Question' },
            {
              id: 'b1',
              label: 'Branch 1',
              action: { event: { name: 'open.branch', context: { node: 'b1' } } },
            },
          ],
          edges: [{ source: 'root', target: 'b1' }],
          selected: { path: '/branch' },
        },
      ],
      { branch: 'b1' },
      async (action) => {
        actions.push(action.name);
      },
    );
    render(wrap(<A2uiSurface surface={surface} />));
    expect(await screen.findByText(/class node1 selected/u)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pick Branch 1' }));
    await vi.waitFor(() => expect(actions).toEqual(['open.branch']));
    fireEvent.click(screen.getByRole('button', { name: 'Pick Question' }));
    expect(actions).toEqual(['open.branch']);
  });
});
