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

describe('ClioPendingInteractions', () => {
  it('renders structured defaults and submits the complete field map', async () => {
    const user = userEvent.setup();
    const interaction = pending('mcp_task_input', {
      prompt: 'Configure the analysis',
      requires_human_response: true,
      actions: ['answer', 'cancel'],
      payload: {
        mode: 'form',
        answer_metadata: { count: 3, method: 'robust', include_uncertain: true },
        fields: [
          {
            name: 'count',
            type: 'integer',
            title: 'Sample count',
            required: true,
            default: 2,
          },
          {
            name: 'method',
            type: 'string',
            title: 'Method',
            enum: ['fast', 'robust'],
            enum_names: ['Fast', 'Robust'],
            required: true,
          },
          {
            name: 'include_uncertain',
            type: 'boolean',
            title: 'Include uncertain samples',
          },
          {
            name: 'outputs',
            type: 'array',
            item_type: 'string',
            title: 'Outputs',
            enum: ['table', 'plot'],
            multi: true,
            min_items: 1,
            max_items: 2,
            required: true,
          },
        ],
      },
    });
    const onResponse = renderPending([interaction]);

    expect(screen.getByLabelText('Sample count')).toHaveValue(3);
    expect(screen.getByRole('radio', { name: 'Robust' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Include uncertain samples' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Send response' }));
    expect(screen.getByText('Choose at least 1.')).toBeVisible();
    expect(onResponse).not.toHaveBeenCalled();

    await user.click(screen.getByRole('checkbox', { name: 'table' }));
    await user.clear(screen.getByLabelText('Sample count'));
    await user.type(screen.getByLabelText('Sample count'), '7');
    await user.click(screen.getByRole('button', { name: 'Send response' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      metadata: {
        count: 7,
        method: 'robust',
        include_uncertain: true,
        outputs: ['table'],
      },
    });
  });

  it('moves an agent fallback into human attention without exposing its code as prose', () => {
    renderPending([
      pending('question', {
        prompt: 'Which solver should run?',
        requires_human_response: true,
        audience: 'agent',
        routing_state: 'agent_elicitation_fallback_to_human',
        fallback_detail: 'agent_answer_timeout',
        actions: ['answer'],
      }),
    ]);

    expect(screen.getByRole('region', { name: 'Agent needs your response' })).toBeVisible();
    expect(
      screen.getByText('The specialist could not answer this, so it needs you.'),
    ).toBeVisible();
    expect(screen.queryByText('agent_answer_timeout')).not.toBeVisible();
    expect(screen.getByText('Technical details')).toBeVisible();
  });

  it('shows URL identity and never navigates before explicit consent', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const interaction = pending('question', {
      prompt: 'Open the result?',
      requires_human_response: true,
      actions: ['answer', 'cancel'],
      payload: {
        mode: 'url',
        url: 'https://xn--bcher-kva.example/report',
        container: 'isolated',
        punycode_warning: true,
        punycode_host: 'bücher.example',
        punycode_host_raw: 'xn--bcher-kva.example',
      },
    });
    const onResponse = renderPending([interaction]);

    expect(open).not.toHaveBeenCalled();
    expect(screen.getByText('Look-alike address warning')).toBeVisible();
    expect(screen.getByText('bücher.example')).toBeVisible();
    expect(screen.getByText('xn--bcher-kva.example')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open link' }));
    expect(open).toHaveBeenCalledWith(
      'https://xn--bcher-kva.example/report',
      '_blank',
      'noopener,noreferrer',
    );
    expect(
      screen.getByText('The browser blocked this link. It has not been accepted.'),
    ).toBeVisible();
    expect(onResponse).not.toHaveBeenCalled();
  });

  it('submits multiple choices and preserves comments for selected options', async () => {
    const user = userEvent.setup();
    const interaction = pending('question', {
      prompt: 'Choose outputs',
      requires_human_response: true,
      actions: ['answer'],
      payload: {
        question_kind: 'multi_choice',
        options: [
          { label: 'Table', value: 'table' },
          { label: 'Plot', value: 'plot' },
        ],
      },
    });
    const onResponse = renderPending([interaction]);

    await user.click(screen.getByRole('checkbox', { name: 'Table' }));
    await user.type(screen.getByLabelText('Comment on Table'), 'Keep sortable columns');
    await user.click(screen.getByRole('checkbox', { name: 'Plot' }));
    await user.click(screen.getByRole('button', { name: 'Send response' }));

    expect(onResponse).toHaveBeenCalledWith(interaction, {
      action: 'answer',
      selected_options: ['table', 'plot'],
      metadata: { option_comments: { table: 'Keep sortable columns' } },
    });
  });

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

  it('shows an unrecognized server-offered action as disabled, never hides it', () => {
    const interaction = pending('permission', {
      id: 'permission:future',
      title: 'Run the future command',
      actions: ['allow', 'allow_forever'],
    });
    renderPending([interaction]);

    expect(screen.getByRole('button', { name: 'Allow once' })).toBeEnabled();
    const unknownAction = screen.getByRole('button', { name: 'allow_forever' });
    expect(unknownAction).toBeDisabled();
    expect(unknownAction).toHaveAttribute('title', 'This client cannot offer "allow_forever" yet.');
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

  it('answers an approval from a session this workspace has not listed yet', async () => {
    const user = userEvent.setup();
    const interaction = pending('permission', {
      id: 'permission:perm_child',
      owner_session_id: 'sess_grandchild',
      title: 'Run the child analysis command',
      actions: ['allow'],
    });
    const onResponse = renderPending([interaction], { ownerLabels: {} });

    expect(screen.getByText('Run the child analysis command')).toBeVisible();
    expect(screen.getByText('Session not listed yet')).toBeVisible();
    expect(screen.queryByText('Specialist')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Allow once' }));
    expect(onResponse).toHaveBeenCalledWith(interaction, { action: 'allow' });
  });

  it('attributes a foreign session even when it attends its own interactions', () => {
    renderPending(
      [
        pending('permission', {
          id: 'permission:foreign',
          owner_session_id: 'sess_foreign',
          attended_session_id: 'sess_foreign',
          title: 'Write the summary file',
        }),
      ],
      { ownerLabels: { sess_foreign: 'Background review' }, viewedSessionId: 'sess_root' },
    );

    expect(screen.getByText('Background review')).toBeVisible();
  });

  it('leaves an interaction owned by the viewed session unattributed', () => {
    renderPending(
      [
        pending('permission', {
          id: 'permission:own',
          owner_session_id: 'sess_root',
          attended_session_id: 'sess_root',
          title: 'Write the summary file',
        }),
      ],
      { ownerLabels: { sess_root: 'Investigation' }, viewedSessionId: 'sess_root' },
    );

    expect(screen.queryByText('Investigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Session not listed yet')).not.toBeInTheDocument();
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

    const title = screen.getByText('Which evidence view should remain primary?');
    expect(title).toHaveAttribute('data-slot', 'pending-interaction-title');
    expect(title).toHaveClass('line-clamp-3');
    expect(title).not.toHaveClass('truncate');
    expect(title).toHaveAttribute('title', 'Which evidence view should remain primary?');

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

  it('reports an unavailable owner honestly instead of inventing a specialist', () => {
    const interaction = pending('question', {
      id: 'question:unlisted-owner',
      owner_session_id: 'sess_not_listed',
      prompt: 'Choose a boundary.',
      title: 'Choose a boundary.',
    });

    renderPending([interaction]);

    // The typed unavailable status, not an invented role. The owning session id
    // rides along as the status detail so the reader can go find it.
    expect(screen.getByText('Session not listed yet')).toBeVisible();
    expect(screen.queryByText('Specialist')).not.toBeInTheDocument();
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

  it('leaves an untouched card interactive while a sibling response is in flight', async () => {
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
          id: 'permission:responding',
          title: 'Run the responding command',
          actions: ['allow'],
        }),
        pending('permission', {
          id: 'permission:idle',
          title: 'Run the idle command',
          actions: ['allow'],
        }),
      ],
      { onResponse },
    );

    await user.click(screen.getAllByRole('button', { name: 'Allow once' })[0]!);

    // The card actually in flight disables; the untouched sibling never does —
    // a shared `disabled` fed by the mutation's own isPending would freeze both.
    expect(screen.getAllByRole('button', { name: 'Allow once' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Allow once' })[1]).toBeEnabled();
    releaseResponse?.();
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Allow once' })[0]).toBeEnabled(),
    );
  });

  it('attributes a failed response to only the card that failed, beside the list error', async () => {
    const user = userEvent.setup();
    const onResponse = vi
      .fn()
      .mockRejectedValueOnce(new Error('The workspace rejected the response.'))
      .mockResolvedValue(undefined);
    renderPending(
      [
        pending('permission', {
          id: 'permission:failing',
          title: 'Run the failing command',
          actions: ['allow'],
        }),
        pending('permission', {
          id: 'permission:other',
          title: 'Run the other command',
          actions: ['allow'],
        }),
      ],
      { error: new Error('capabilities unavailable'), onResponse },
    );

    await user.click(screen.getAllByRole('button', { name: 'Allow once' })[0]!);

    await waitFor(() =>
      expect(screen.getByText('The workspace rejected the response.')).toBeVisible(),
    );
    // The list-level read failure is still reported, unmasked and undisturbed.
    expect(screen.getByText('capabilities unavailable')).toBeVisible();
    // The sibling card carries no error of its own.
    expect(
      screen
        .getByText('Run the other command')
        .closest('[role="alert"]')
        ?.textContent?.includes('Response unavailable'),
    ).toBe(false);
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

    // Each kind's own reader-visible content, not the private data-interaction-kind
    // attribute the branching logic happens to stamp on its wrapper.
    expect(screen.getByText('Question')).toBeVisible();
    expect(screen.getByText('Permission')).toBeVisible();
    expect(screen.getByText('Select task input')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit selection' })).toBeVisible();
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

    await user.click(screen.getByRole('button', { name: 'Submit selection' }));

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

    await user.click(screen.getByRole('button', { name: 'Submit selection' }));

    expect(onResponse).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        correlation: { run_id: 'run_1', message_id: 'message_1', part_id: 'invocation_1' },
      }),
    );
  });

  it("dims a disabled A2UI surface only to this repo's WCAG AA contrast floor", () => {
    const surface = actionSurface();
    const interaction = pending('a2ui', {
      id: 'a2ui:sess_child:surface_1',
      source: { protocol: 'native', surface_id: 'surface_1' },
      actions: ['form.submit'],
    });
    renderPending([interaction], { disabled: true, surfaces: { surface_1: surface } });

    const panel = screen
      .getByRole('button', { name: 'Submit selection' })
      .closest('[data-slot="frame-panel"]');
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

  it('exposes a bounded independently keyboard-scrollable response viewport', () => {
    renderPending([
      pending('permission', { id: 'permission:p1' }),
      pending('question', {
        id: 'question:q1',
        actions: ['answer'],
        payload: { allow_freeform: true },
      }),
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

    // The panel caps its height rather than always claiming it (a single
    // response sizes to its content, and only a stack past the cap scrolls) —
    // demonstrated here by behavior, not by asserting the Tailwind class name
    // that implements it: a genuinely bounded, keyboard-scrollable region.
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

    const answer = screen.getAllByRole('textbox')[0]!;
    answer.focus();
    viewport.scrollTop = 240;
    fireEvent.keyDown(answer, { key: 'Home' });
    expect(viewport.scrollTop).toBe(240);
  });

  it('leaves caret keys to the answer field they were typed into', async () => {
    const user = userEvent.setup();
    renderPending([
      pending('question', {
        id: 'question:q1',
        prompt: 'Which boundary should I use?',
        actions: ['answer'],
      }),
    ]);

    const answer = screen.getByRole('textbox', { name: 'Your response' });
    await user.type(answer, 'first line');
    const viewport = screen.getByRole('region', { name: '1 pending responses' });
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 240 },
      scrollHeight: { configurable: true, value: 720 },
    });
    viewport.scrollTop = 120;

    for (const key of ['Home', 'End', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']) {
      const handled = fireEvent.keyDown(answer, { bubbles: true, key });
      // `fireEvent` returns false only when a handler called preventDefault, so
      // this asserts the caret key reached the field rather than the viewport.
      expect(handled, `${key} was hijacked by the scroll viewport`).toBe(true);
    }
    expect(viewport.scrollTop).toBe(120);
  });
});
