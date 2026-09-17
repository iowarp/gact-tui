import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIO_A2UI_CATALOG_ID, CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { ClioA2UISurface } from './a2ui-surface';

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
  return render(
    <QueryClientProvider client={client}>
      <ClioA2UISurface surface={surface} />
    </QueryClientProvider>,
  );
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

  it('renders a typed failure for an unknown catalogId', async () => {
    const surface = actionSurface('artifact.open', {});
    (surface.messages[0] as { createSurface: { catalogId: string } }).createSurface.catalogId =
      'https://example.test/a2ui/catalogs/not-installed';

    renderSurface(surface);

    expect(await screen.findByText('Interactive surface unavailable')).toBeVisible();
    expect(screen.getAllByText(/Catalog not found/u)[0]).toBeVisible();
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
});
