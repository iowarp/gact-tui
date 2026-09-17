import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIO_A2UI_CATALOG_ID, CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSessionRegistryOwner } from '@/test-fixtures/a2ui/v0_9_1/test-harness';
import { ClioA2UISurface } from './a2ui-surface';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
  a2uiCatalogs: vi.fn(),
  a2uiCapabilities: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

beforeEach(() => {
  repository.a2uiCatalogs.mockResolvedValue([CLIO_WORKSPACE_CATALOG_ROW]);
  repository.a2uiCapabilities.mockResolvedValue({
    agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
    client: null,
    selection: null,
  });
});

afterEach(() => {
  cleanup();
  repository.a2uiAction.mockClear();
  repository.a2uiCatalogs.mockClear();
  repository.a2uiCapabilities.mockClear();
  vi.restoreAllMocks();
});

function actionSurface(name: string, context: Record<string, unknown>): A2UISurface {
  const id = `surface-${name}`;
  return {
    id,
    session_id: 'sess_1',
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    messages: [
      {
        version: 'v0.9.1',
        createSurface: { surfaceId: id, catalogId: CLIO_A2UI_CATALOG_ID },
      },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: id,
          components: [
            { id: 'root', component: 'Column', children: ['label', 'action'] },
            { id: 'label', component: 'Text', text: 'Open result' },
            {
              id: 'action',
              component: 'Button',
              child: 'label',
              action: { event: { name, context } },
            },
          ],
        },
      },
    ],
  };
}

function renderSurface(surface: A2UISurface) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const tree = (next: A2UISurface) => (
    <QueryClientProvider client={client}>
      <A2uiSessionRegistryOwner sessionId={next.session_id}>
        <ClioA2UISurface surface={next} />
      </A2uiSessionRegistryOwner>
    </QueryClientProvider>
  );
  const utils = render(tree(surface));
  return { ...utils, update: (next: A2UISurface) => utils.rerender(tree(next)) };
}

describe('ClioA2UISurface actions', () => {
  it('renders a service-reported surface failure instead of a busy surface', () => {
    const surface = actionSurface('artifact.open', {});
    surface.state = 'failed';
    surface.error = 'The server rejected an invalid component binding.';

    renderSurface(surface);

    expect(screen.getByText('Interactive surface unavailable')).toBeVisible();
    expect(screen.getAllByText(new RegExp(surface.error, 'u'))[0]).toBeVisible();
    expect(screen.queryByText('Analysis view')).not.toBeInTheDocument();
  });

  it('does not paint a disconnected surface with the success status', async () => {
    const surface = actionSurface('artifact.open', {});
    surface.state = 'disconnected';

    renderSurface(surface);

    const badge = (await screen.findByText('disconnected')).closest('[data-slot="badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).not.toContain('text-success');
  });

  it('marks a surface waiting on a user action as needing attention', async () => {
    const surface = actionSurface('artifact.open', {});
    surface.state = 'pending_action';

    renderSurface(surface);

    const badge = (await screen.findByText('pending action')).closest('[data-slot="badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('text-action');
  });

  it('contains an invalid historical surface without throwing through React', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const surface = actionSurface('artifact.open', {});
    const update = surface.messages[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    update.updateComponents.components[0]!.accessibility = 'Invalid legacy label';

    renderSurface(surface);

    expect(await screen.findByText('Interactive surface unavailable')).toBeVisible();
    expect(screen.getAllByText(/accessibility/u)[0]).toBeVisible();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('renders an unknown component inline without failing the whole surface', async () => {
    const surface = actionSurface('artifact.open', {});
    const update = surface.messages[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    update.updateComponents.components[0]!.component = 'Checkbox';

    renderSurface(surface);

    expect(await screen.findByText(/Unknown component: Checkbox/u)).toBeVisible();
    expect(screen.queryByText('Interactive surface unavailable')).not.toBeInTheDocument();
  });

  it('renders a typed failure for an unknown catalogId without leaking the catalog URI as product copy', async () => {
    const unknownCatalogId = 'https://example.test/a2ui/catalogs/not-installed';
    const surface = actionSurface('artifact.open', {});
    surface.catalog_id = unknownCatalogId;
    (surface.messages[0] as { createSurface: { catalogId: string } }).createSurface.catalogId =
      unknownCatalogId;

    renderSurface(surface);

    expect(await screen.findByText('Interactive surface unavailable')).toBeVisible();
    // Visible, primary product copy — worded, no catalog URI.
    const primaryCopy = screen.getByText(
      /This view uses a catalog this workspace does not have installed\./u,
    );
    expect(primaryCopy).toBeVisible();
    expect(primaryCopy.textContent).not.toContain(unknownCatalogId);
    // The URI is allowed only inside the hidden "Validation detail" technical section.
    expect(screen.queryByText('Validation detail')).toBeInTheDocument();
    // The registry is refetched exactly once so a catalog installed moments
    // ago resolves without a manual retry.
    await waitFor(() => expect(repository.a2uiCatalogs).toHaveBeenCalledTimes(2));
  });

  it('runs the openArtifact catalog function without any repository call', async () => {
    const user = userEvent.setup();
    const surface = actionSurface('artifact.open', {});
    const update = surface.messages[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    update.updateComponents.components[2] = {
      id: 'action',
      component: 'Button',
      child: 'label',
      action: { functionCall: { call: 'openArtifact', args: { uri: 'artifact://artifact_1' } } },
    };

    renderSurface(surface);

    await user.click(await screen.findByRole('button', { name: 'Open result' }));

    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('renders a worded failure when openArtifact has no runtime or artifact to open', async () => {
    const user = userEvent.setup();
    const surface = actionSurface('artifact.open', {});
    const update = surface.messages[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    update.updateComponents.components[2] = {
      id: 'action',
      component: 'Button',
      child: 'label',
      action: { functionCall: { call: 'openArtifact', args: { uri: 'artifact://artifact_missing' } } },
    };

    renderSurface(surface);

    await user.click(await screen.findByRole('button', { name: 'Open result' }));

    expect(
      await screen.findByText('The requested artifact is not available in this session.'),
    ).toBeVisible();
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('applies the URL scheme guard to openArtifact before opening anything', async () => {
    const user = userEvent.setup();
    const surface = actionSurface('artifact.open', {});
    const update = surface.messages[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    update.updateComponents.components[2] = {
      id: 'action',
      component: 'Button',
      child: 'label',
      action: { functionCall: { call: 'openArtifact', args: { uri: 'javascript:alert(1)' } } },
    };

    renderSurface(surface);

    await user.click(await screen.findByRole('button', { name: 'Open result' }));

    expect(await screen.findByText(/not an allowed URL scheme/u)).toBeVisible();
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('posts registered server actions with the official action envelope', async () => {
    const user = userEvent.setup();
    renderSurface(actionSurface('form.submit', { selection: 'bounded' }));

    await user.click(await screen.findByRole('button', { name: 'Open result' }));

    expect(repository.a2uiAction).toHaveBeenCalledWith(
      'sess_1',
      {
        version: 'v0.9.1',
        action: expect.objectContaining({
          name: 'form.submit',
          context: { selection: 'bounded' },
        }),
      },
      { run_id: undefined, message_id: undefined, part_id: undefined },
    );
  });

  it('posts the exact VALIDATION_FAILED envelope for a blocked URL scheme', async () => {
    const surface = actionSurface('artifact.open', {});
    const update = surface.messages[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    update.updateComponents.components.push({
      id: 'image',
      component: 'Image',
      url: 'javascript:alert(1)',
    });
    (update.updateComponents.components[0] as { children: string[] }).children.push('image');

    renderSurface(surface);

    expect(await screen.findByRole('alert')).toHaveTextContent(/not an allowed URL scheme/u);
    expect(repository.a2uiAction).toHaveBeenCalledWith(
      surface.session_id,
      {
        version: 'v0.9.1',
        error: {
          code: 'VALIDATION_FAILED',
          surfaceId: surface.id,
          path: '/image/url',
          message: expect.stringContaining('not an allowed URL scheme'),
        },
      },
    );
  });

  it('renders a worded state when the service cannot record a VALIDATION_FAILED report', async () => {
    repository.a2uiAction.mockImplementation((_sessionId: string, message: unknown) => {
      if (message && typeof message === 'object' && 'error' in message) {
        return Promise.reject(new Error('404'));
      }
      return Promise.resolve({ status: 'accepted' });
    });
    const surface = actionSurface('artifact.open', {});
    const update = surface.messages[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    update.updateComponents.components.push({
      id: 'image',
      component: 'Image',
      url: 'javascript:alert(1)',
    });
    (update.updateComponents.components[0] as { children: string[] }).children.push('image');

    renderSurface(surface);

    expect(
      await screen.findByText('The service could not record the rendering problem: 404'),
    ).toBeVisible();
  });

  it('keeps typed TextField text across an updateDataModel to another path and a server revision bump', async () => {
    const user = userEvent.setup();
    const surfaceId = 'surface-text-persist';
    const surface: A2UISurface = {
      id: surfaceId,
      session_id: 'sess_1',
      catalog_id: CLIO_A2UI_CATALOG_ID,
      protocol_version: '0.9.1',
      revision: 1,
      state: 'ready',
      messages: [
        { version: 'v0.9.1', createSurface: { surfaceId, catalogId: CLIO_A2UI_CATALOG_ID } },
        { version: 'v0.9.1', updateDataModel: { surfaceId, path: '/name', value: '' } },
        {
          version: 'v0.9.1',
          updateComponents: {
            surfaceId,
            components: [
              { id: 'root', component: 'TextField', label: 'Name', value: { path: '/name' } },
            ],
          },
        },
      ],
    };

    const { update } = renderSurface(surface);
    const input = await screen.findByLabelText('Name');
    await user.type(input, 'Alice');
    expect(input).toHaveValue('Alice');

    // An unrelated updateDataModel message arrives (same surface id, new
    // message array reference) — must not disturb the typed text.
    const withUnrelatedUpdate: A2UISurface = {
      ...surface,
      messages: [
        ...surface.messages,
        { version: 'v0.9.1', updateDataModel: { surfaceId, path: '/unrelated', value: 'server-value' } },
      ],
    };
    update(withUnrelatedUpdate);
    expect(screen.getByLabelText('Name')).toHaveValue('Alice');

    // A server a2ui.surface.upserted revision bump — SurfaceBoundary is keyed
    // on surface.id only (the deleted `${id}:${revision}` remount wiped this).
    update({ ...withUnrelatedUpdate, revision: 2 });
    expect(screen.getByLabelText('Name')).toHaveValue('Alice');
  });

  it('disables a Button with a failing required check until input satisfies it', async () => {
    const user = userEvent.setup();
    const surfaceId = 'surface-required-check';
    const surface: A2UISurface = {
      id: surfaceId,
      session_id: 'sess_1',
      catalog_id: CLIO_A2UI_CATALOG_ID,
      protocol_version: '0.9.1',
      revision: 1,
      state: 'ready',
      messages: [
        { version: 'v0.9.1', createSurface: { surfaceId, catalogId: CLIO_A2UI_CATALOG_ID } },
        { version: 'v0.9.1', updateDataModel: { surfaceId, path: '/name', value: '' } },
        {
          version: 'v0.9.1',
          updateComponents: {
            surfaceId,
            components: [
              { id: 'root', component: 'Column', children: ['field', 'submit', 'label'] },
              { id: 'field', component: 'TextField', label: 'Name', value: { path: '/name' } },
              { id: 'label', component: 'Text', text: 'Continue' },
              {
                id: 'submit',
                component: 'Button',
                child: 'label',
                action: { event: { name: 'continue', context: {} } },
                checks: [
                  {
                    condition: { call: 'required', args: { value: { path: '/name' } } },
                    message: 'Name is required',
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    renderSurface(surface);

    const button = await screen.findByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();

    await user.type(await screen.findByLabelText('Name'), 'Alice');

    expect(button).toBeEnabled();
  });
});
