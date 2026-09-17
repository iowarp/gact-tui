import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function pendingA2UI(): PendingInteraction {
  return {
    id: 'a2ui:sess_child:surface_1',
    kind: 'a2ui',
    owner_session_id: 'sess_child',
    attended_session_id: 'sess_root',
    status: 'pending',
    title: 'Response requested',
    prompt: 'Choose an observed EarthScope station',
    source: { protocol: 'native', surface_id: 'surface_1' },
    actions: ['form.submit'],
    created_at: '2026-09-02T00:00:00Z',
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

function renderPendingA2UI(): void {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClioPendingInteractions
        interactions={[pendingA2UI()]}
        onResponse={vi.fn(async () => undefined)}
        ownerLabels={{ sess_child: 'Evidence specialist' }}
        surfaces={{ surface_1: actionSurface() }}
        viewedSessionId="sess_root"
      />
    </QueryClientProvider>,
  );
}

describe('PendingA2UIResponse', () => {
  it('flattens the inline surface and can open it in a full-window view', async () => {
    const user = userEvent.setup();
    renderPendingA2UI();

    expect(screen.queryByText('Generated UI')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resize interactive surface' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open interactive surface full screen' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    expect(dialog).toHaveTextContent('Choose an observed EarthScope station');
    expect(screen.getByRole('button', { name: 'Submit selection' })).toBeVisible();
  });

  it('lets pointer and keyboard users resize the inline viewport', async () => {
    const user = userEvent.setup();
    renderPendingA2UI();

    const resize = screen.getByRole('button', { name: 'Resize interactive surface' });
    const viewport = screen
      .getByRole('button', { name: 'Submit selection' })
      .closest('[data-slot="a2ui-response-viewport"]');
    expect(viewport).toHaveStyle({ height: '480px' });

    Object.assign(resize, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    fireEvent.pointerDown(resize, { buttons: 1, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(resize, { buttons: 1, clientY: 240, pointerId: 1 });
    fireEvent.pointerUp(resize, { clientY: 240, pointerId: 1 });
    expect(viewport).toHaveStyle({ height: '520px' });

    // Browsers synthesize a click after pointer release. It must not undo the
    // drag; the next deliberate activation still toggles the viewport size.
    fireEvent.click(resize);
    expect(viewport).toHaveStyle({ height: '520px' });
    resize.focus();
    await user.keyboard('{Enter}');
    expect(viewport).toHaveStyle({ height: '552px' });
  });
});
