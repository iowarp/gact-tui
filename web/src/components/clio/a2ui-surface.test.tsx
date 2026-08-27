import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIO_A2UI_CATALOG_ID } from './a2ui-catalog';
import { ClioA2UISurface } from './a2ui-surface';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

afterEach(() => {
  cleanup();
  repository.a2uiAction.mockClear();
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

function renderSurface(
  surface: A2UISurface,
  onLocalAction?: Parameters<typeof ClioA2UISurface>[0]['onLocalAction'],
) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClioA2UISurface onLocalAction={onLocalAction} surface={surface} />
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

  it('contains an invalid historical surface without throwing through React', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const surface = actionSurface('artifact.open', {});
    const update = surface.messages[1] as {
      updateComponents: { components: Array<Record<string, unknown>> };
    };
    update.updateComponents.components[0]!.accessibility = 'Invalid legacy label';

    renderSurface(surface);

    expect(screen.getByText('Interactive surface unavailable')).toBeVisible();
    expect(screen.getAllByText(/accessibility: Expected object/u)[0]).toBeVisible();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('keeps artifact.open local and never posts it to the server action route', async () => {
    const user = userEvent.setup();
    const onLocalAction = vi.fn().mockResolvedValue('result.csv opened in the workspace canvas');
    renderSurface(actionSurface('artifact.open', { artifact_id: 'artifact_1' }), onLocalAction);

    await user.click(screen.getByRole('button', { name: 'Open result' }));

    expect(onLocalAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'artifact.open', context: { artifact_id: 'artifact_1' } }),
    );
    expect(repository.a2uiAction).not.toHaveBeenCalled();
    expect(await screen.findByText('result.csv opened in the workspace canvas')).toBeVisible();
  });

  it('posts registered server actions with the official action envelope', async () => {
    const user = userEvent.setup();
    renderSurface(actionSurface('form.submit', { selection: 'bounded' }));

    await user.click(screen.getByRole('button', { name: 'Open result' }));

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
});
