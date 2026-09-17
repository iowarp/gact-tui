import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIO_A2UI_CATALOG_ID, CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { ClioPendingInteractions } from './pending-interactions';

// Split out of pending-interactions.test.tsx by behavior (CLIO-owned
// TypeScript file-size ratchet, scripts/check_frontend_file_size.mjs): every
// case here exercises the `a2ui` pending-interaction kind specifically.

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
  a2uiCatalogs: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

beforeEach(() => {
  repository.a2uiCatalogs.mockResolvedValue([CLIO_WORKSPACE_CATALOG_ROW]);
});

afterEach(() => {
  cleanup();
  repository.a2uiAction.mockClear();
  repository.a2uiCatalogs.mockClear();
});

function pending(
  kind: PendingInteraction['kind'],
  overrides: Partial<PendingInteraction> = {},
): PendingInteraction {
  return {
    id: `${kind}:interaction_1`,
    kind,
    owner_session_id: 'sess_child',
    attended_session_id: 'sess_root',
    status: 'pending',
    title: 'Response requested',
    source: { protocol: kind === 'mcp_task_input' ? 'mcp' : 'native' },
    created_at: '2026-09-02T00:00:00Z',
    ...overrides,
  };
}

function actionSurface(): A2UISurface {
  return {
    id: 'surface_1',
    session_id: 'sess_child',
    run_id: 'run_1',
    message_id: 'message_1',
    part_id: 'part_1',
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    messages: [
      {
        version: 'v0.9.1',
        createSurface: { surfaceId: 'surface_1', catalogId: CLIO_A2UI_CATALOG_ID },
      },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'surface_1',
          components: [
            { id: 'root', component: 'Column', children: ['label', 'action'] },
            { id: 'label', component: 'Text', text: 'Submit selection' },
            {
              id: 'action',
              component: 'Button',
              child: 'label',
              action: { event: { name: 'form.submit', context: { selection: 'bounded' } } },
            },
          ],
        },
      },
    ],
  };
}

function renderPending(
  interactions: PendingInteraction[],
  options: {
    disabled?: boolean;
    error?: Error;
    onRefetchSurfaces?: ReturnType<typeof vi.fn>;
    onResponse?: ReturnType<typeof vi.fn>;
    ownerLabels?: Record<string, string>;
    surfaces?: Record<string, A2UISurface>;
    viewedSessionId?: string;
  } = {},
) {
  const onResponse = options.onResponse ?? vi.fn(async () => undefined);
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClioPendingInteractions
        disabled={options.disabled}
        error={options.error}
        interactions={interactions}
        onRefetchSurfaces={options.onRefetchSurfaces}
        onResponse={onResponse}
        ownerLabels={options.ownerLabels ?? { sess_child: 'Evidence specialist' }}
        surfaces={options.surfaces}
        viewedSessionId={options.viewedSessionId ?? 'sess_root'}
      />
    </QueryClientProvider>,
  );
  return onResponse;
}

describe('ClioPendingInteractions A2UI kind', () => {
  it('renders question, permission, task input, and child-owned A2UI as distinct kinds', async () => {
    const surface = actionSurface();
    renderPending(
      [
        pending('question', { id: 'question:q1', prompt: 'Question', actions: [] }),
        pending('permission', { id: 'permission:p1', title: 'Permission' }),
        pending('mcp_task_input', {
          id: 'mcp_task_input:q2',
          prompt: 'Select task input',
          actions: [],
        }),
        pending('a2ui', {
          id: 'a2ui:sess_child:surface_1',
          source: { protocol: 'native', surface_id: 'surface_1' },
          actions: ['form.submit'],
        }),
      ],
      { surfaces: { surface_1: surface } },
    );

    // Each kind's own reader-visible content, not the private data-interaction-kind
    // attribute the branching logic happens to stamp on its wrapper.
    expect(screen.getByText('Question')).toBeVisible();
    expect(screen.getByText('Permission')).toBeVisible();
    expect(screen.getByText('Select task input')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Submit selection' })).toBeVisible();
    expect(screen.getAllByText('Evidence specialist')).toHaveLength(4);
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('routes a child A2UI action through the normalized interaction response', async () => {
    const user = userEvent.setup();
    const surface = actionSurface();
    const interaction = pending('a2ui', {
      id: 'a2ui:sess_child:surface_1',
      source: { protocol: 'native', surface_id: 'surface_1' },
      actions: ['form.submit'],
    });
    const onResponse = renderPending([interaction], {
      surfaces: { surface_1: surface },
    });

    await user.click(await screen.findByRole('button', { name: 'Submit selection' }));

    expect(onResponse).toHaveBeenCalledWith(interaction, {
      // The message identity being answered, for the server's own correlation
      // — dropped entirely on this path before repository.a2uiAction gained it.
      correlation: { run_id: 'run_1', message_id: 'message_1', part_id: 'part_1' },
      message: {
        version: 'v0.9.1',
        action: expect.objectContaining({
          name: 'form.submit',
          surfaceId: 'surface_1',
          context: { selection: 'bounded' },
        }),
      },
    });
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it("falls back to the interaction's invocation_id when the surface has no part_id", async () => {
    const user = userEvent.setup();
    const surface: A2UISurface = { ...actionSurface(), part_id: undefined };
    const interaction = pending('a2ui', {
      id: 'a2ui:sess_child:surface_1',
      source: { protocol: 'native', surface_id: 'surface_1', invocation_id: 'invocation_1' },
      actions: ['form.submit'],
    });
    const onResponse = renderPending([interaction], { surfaces: { surface_1: surface } });

    await user.click(await screen.findByRole('button', { name: 'Submit selection' }));

    expect(onResponse).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        correlation: { run_id: 'run_1', message_id: 'message_1', part_id: 'invocation_1' },
      }),
    );
  });

  it("dims a disabled A2UI surface only to this repo's WCAG AA contrast floor", async () => {
    const surface = actionSurface();
    const interaction = pending('a2ui', {
      id: 'a2ui:sess_child:surface_1',
      source: { protocol: 'native', surface_id: 'surface_1' },
      actions: ['form.submit'],
    });
    renderPending([interaction], { disabled: true, surfaces: { surface_1: surface } });

    const panel = (await screen.findByRole('button', { name: 'Submit selection' })).closest(
      '[data-slot="frame-panel"]',
    );
    expect(panel).toHaveClass('opacity-70');
    expect(panel).not.toHaveClass('opacity-60');
  });

  it('names a missing surface reference as terminal, not "loading"', () => {
    const interaction = pending('a2ui', {
      id: 'a2ui:sess_child:no_surface',
      source: { protocol: 'native' },
      actions: [],
    });
    renderPending([interaction]);

    expect(screen.getByText('This interactive view has no surface to open.')).toBeVisible();
    expect(screen.queryByText('Interactive view is loading.')).not.toBeInTheDocument();
  });

  it('rejects a surface addressed to a different session instead of reading it as loading', () => {
    const foreignSurface: A2UISurface = { ...actionSurface(), session_id: 'sess_other' };
    const interaction = pending('a2ui', {
      id: 'a2ui:sess_child:surface_1',
      source: { protocol: 'native', surface_id: 'surface_1' },
      actions: [],
    });
    renderPending([interaction], { surfaces: { surface_1: foreignSurface } });

    expect(
      screen.getByText(
        'This interactive view was rejected: it was addressed to a different session.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Interactive view is loading.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit selection' })).not.toBeInTheDocument();
  });

  it('offers a retry for a surface still waiting on its read', async () => {
    const user = userEvent.setup();
    const onRefetchSurfaces = vi.fn();
    const interaction = pending('a2ui', {
      id: 'a2ui:sess_child:surface_1',
      source: { protocol: 'native', surface_id: 'surface_1' },
      actions: [],
    });
    renderPending([interaction], { onRefetchSurfaces });

    expect(screen.getByText('Interactive view is loading.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRefetchSurfaces).toHaveBeenCalledTimes(1);
  });

  it('lets an A2UI card with a cancel action be cleared even while its surface never resolves', async () => {
    const user = userEvent.setup();
    const interaction = pending('a2ui', {
      id: 'a2ui:sess_child:surface_1',
      source: { protocol: 'native', surface_id: 'surface_1' },
      actions: ['cancel'],
    });
    const onResponse = renderPending([interaction]);

    await user.click(screen.getByRole('button', { name: 'Cancel question' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, { action: 'cancel' });
  });
});
