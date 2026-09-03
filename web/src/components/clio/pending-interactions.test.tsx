import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIO_A2UI_CATALOG_ID } from './a2ui-catalog';
import { ClioPendingInteractions } from './pending-interactions';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

afterEach(() => {
  cleanup();
  repository.a2uiAction.mockClear();
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
    error?: Error;
    onResponse?: ReturnType<typeof vi.fn>;
    ownerLabels?: Record<string, string>;
    surfaces?: Record<string, A2UISurface>;
  } = {},
) {
  const onResponse = options.onResponse ?? vi.fn(async () => undefined);
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClioPendingInteractions
        error={options.error}
        interactions={interactions}
        onResponse={onResponse}
        ownerLabels={options.ownerLabels ?? { sess_child: 'Evidence specialist' }}
        surfaces={options.surfaces}
      />
    </QueryClientProvider>,
  );
  return onResponse;
}

describe('ClioPendingInteractions', () => {
  it('keeps the accepted collapsible approval surface and emits the exact normalized action', async () => {
    const user = userEvent.setup();
    const interaction = pending('permission', {
      id: 'permission:perm_1',
      title: 'Run the analysis command',
      source: { protocol: 'native', tool_name: 'shell.exec' },
      payload: {
        permission_id: 'perm_1',
        tool_call: { tool_name: 'shell.exec', input: { cmd: 'inspect workspace' } },
      },
      actions: ['allow', 'deny', 'allow_session', 'allow_workspace'],
    });
    const onResponse = renderPending([interaction]);

    const region = screen.getByRole('region', { name: 'Agent needs your response' });
    const trigger = screen.getByRole('button', { name: '1 response needed' });
    expect(region).toBeVisible();
    const title = screen.getByText('Run the analysis command');
    expect(title).toHaveAttribute('data-slot', 'pending-interaction-title');
    expect(title).toHaveClass('line-clamp-3');
    expect(title).not.toHaveClass('truncate');
    expect(title).toHaveAttribute('title', 'Run the analysis command');
    expect(screen.getByText('Evidence specialist')).toBeVisible();
    expect(screen.queryByText('Approval')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeVisible();
    await user.click(trigger);
    expect(screen.queryByText('Run the analysis command')).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByText('Run the analysis command')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Allow for session' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, { action: 'allow_session' });
  });

  it('names the read that failed while it still renders what it could read', () => {
    renderPending([pending('permission', { id: 'permission:p1', title: 'Run the command' })], {
      error: new Error('capabilities unavailable'),
    });

    expect(screen.getByText('Run the command')).toBeVisible();
    expect(screen.getByText('Some responses could not be read')).toBeVisible();
    expect(screen.getByText('capabilities unavailable')).toBeVisible();
  });

  it('still reports a failed read when it has nothing left to render', () => {
    renderPending([], { error: new Error('capabilities unavailable') });

    expect(screen.getByText('Some responses could not be read')).toBeVisible();
    expect(screen.getByText('capabilities unavailable')).toBeVisible();
  });

  it('preserves per-option comments in the exact normalized question response', async () => {
    const user = userEvent.setup();
    const interaction = pending('question', {
      id: 'question:q1',
      prompt: 'Which evidence view should remain primary?',
      payload: {
        question_id: 'q1',
        question_kind: 'choice',
        options: [
          { label: 'Station table', value: 'table' },
          { label: 'Displacement plot', value: 'plot' },
        ],
      },
      actions: ['answer', 'cancel'],
    });
    const onResponse = renderPending([interaction]);

    await user.click(screen.getByRole('radio', { name: 'Station table' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Comment on Station table' }),
      'Keep the sortable columns visible.',
    );
    await user.click(screen.getByRole('radio', { name: 'Displacement plot' }));
    await user.click(screen.getByRole('radio', { name: 'Station table' }));
    expect(screen.getByRole('textbox', { name: 'Comment on Station table' })).toHaveValue(
      'Keep the sortable columns visible.',
    );
    await user.click(screen.getByRole('button', { name: 'Send response' }));

    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      answer: 'Keep the sortable columns visible.',
      selected_options: ['table'],
    });
  });

  it('allows choices and a free-form answer in the same child question', async () => {
    const user = userEvent.setup();
    const interaction = pending('question', {
      id: 'question:q-freeform',
      prompt: 'Which evidence boundary should I use?',
      payload: {
        question_id: 'q-freeform',
        question_kind: 'choice',
        options: [{ label: 'Published studies', value: 'published' }],
        allow_freeform: true,
      },
      actions: ['answer'],
    });
    const onResponse = renderPending([interaction]);

    await user.click(screen.getByRole('radio', { name: 'Something else' }));
    await user.type(screen.getByRole('textbox', { name: 'Your response' }), 'Include field notes.');
    await user.click(screen.getByRole('button', { name: 'Send response' }));

    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      answer: 'Include field notes.',
    });
  });

  it('routes cancellation and omits an expired interaction from the stack', async () => {
    const user = userEvent.setup();
    const interaction = pending('question', {
      id: 'question:pending',
      prompt: 'Pending question',
      actions: ['answer', 'cancel'],
    });
    const onResponse = renderPending([
      interaction,
      pending('question', {
        id: 'question:expired',
        prompt: 'Expired question',
        status: 'expired',
        actions: [],
      }),
    ]);

    expect(screen.queryByText('Expired question')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel question' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, { action: 'cancel' });
  });

  it('suppresses duplicate responses while an interaction response is in flight', async () => {
    const user = userEvent.setup();
    let releaseResponse: (() => void) | undefined;
    const onResponse = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseResponse = resolve;
        }),
    );
    renderPending(
      [
        pending('permission', {
          id: 'permission:once',
          actions: ['allow'],
        }),
      ],
      { onResponse },
    );

    await user.dblClick(screen.getByRole('button', { name: 'Allow once' }));
    expect(onResponse).toHaveBeenCalledTimes(1);
    releaseResponse?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Allow once' })).toBeEnabled());
  });

  it('renders question, permission, task input, and child-owned A2UI as distinct kinds', () => {
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

    for (const kind of ['question', 'permission', 'mcp_task_input', 'a2ui']) {
      expect(document.querySelector(`[data-interaction-kind="${kind}"]`)).toBeVisible();
    }
    expect(screen.getAllByText('Evidence specialist')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Submit selection' })).toBeVisible();
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

    await user.click(screen.getByRole('button', { name: 'Submit selection' }));

    expect(onResponse).toHaveBeenCalledWith(interaction, {
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

  it('exposes a bounded independently keyboard-scrollable response viewport', () => {
    renderPending([
      pending('permission', { id: 'permission:p1' }),
      pending('question', { id: 'question:q1', actions: [] }),
    ]);

    const responses = screen.getByRole('region', { name: 'Agent needs your response' });
    const viewport = screen.getByRole('region', { name: '2 pending responses' });
    expect(responses).toHaveClass('min-h-0', 'shrink');
    // The panel floats on the composer and reads as one surface with it only
    // while the Queue's translucent fill survives. Any background of its own
    // replaces these through tailwind-merge, which is how that continuity was
    // lost once already.
    expect(responses).toHaveClass('bg-card/70', 'dark:bg-card/60');
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(viewport).toHaveClass('pending-interactions-viewport', 'overscroll-contain');
    expect(viewport.closest('[data-slot="scroll-area"]')).toHaveClass(
      'h-[min(22rem,40dvh)]',
      'min-h-0',
    );
    expect(viewport).toHaveStyle({ overflowY: 'scroll' });

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 240 },
      scrollHeight: { configurable: true, value: 720 },
    });
    viewport.scrollTop = 480;
    fireEvent.keyDown(viewport, { key: 'Home' });
    expect(viewport.scrollTop).toBe(0);
    fireEvent.keyDown(viewport, { key: 'PageDown' });
    expect(viewport.scrollTop).toBe(216);
    fireEvent.keyDown(viewport, { key: 'End' });
    expect(viewport.scrollTop).toBe(480);
  });
});
