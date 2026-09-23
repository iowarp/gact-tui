import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIO_A2UI_CATALOG_ID } from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { ClioPendingInteractions } from './pending-interactions';

// Exercise the pending card's resize and portal behavior independently of the
// catalog renderer, whose conformance has its own tests.
vi.mock('./a2ui-surface', async () => {
  const React = await import('react');
  return {
    ClioA2UISurface: ({ surface }: { surface: A2UISurface }) => {
      const [selected, setSelected] = React.useState('Station 1');
      const isMap = JSON.stringify(surface.messages).includes('clio.map.v1');
      if (!isMap) return <button type="button">Submit selection</button>;
      return (
        <div aria-label="EarthScope stations map" className="border" data-slot="frame" role="group">
          {['Station 1', 'Station 2'].map((station) => (
            <button
              aria-pressed={selected === station}
              key={station}
              onClick={() => setSelected(station)}
              type="button"
            >
              {station}
            </button>
          ))}
        </div>
      );
    },
  };
});

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

afterEach(() => {
  cleanup();
  repository.a2uiAction.mockClear();
  window.sessionStorage.clear();
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

/** A surface whose catalog content is the EarthScope map — the one box the tray is allowed to keep. */
function mapSurface(): A2UISurface {
  return {
    ...actionSurface(),
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
            {
              id: 'root',
              component: 'clio.map.v1',
              title: 'EarthScope stations',
              points: [
                { id: 'station_1', label: 'Station 1', latitude: 41.88, longitude: -87.63 },
                { id: 'station_2', label: 'Station 2', latitude: 42.36, longitude: -71.06 },
              ],
            },
          ],
        },
      },
    ],
  };
}

function renderPendingA2UI(surface: A2UISurface = actionSurface()): void {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClioPendingInteractions
        interactions={[pendingA2UI()]}
        onResponse={vi.fn(async () => undefined)}
        ownerLabels={{ sess_child: 'Evidence specialist' }}
        surfaces={{ surface_1: surface }}
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

  it('pending_a2ui_renders_single_bordered_container: keeps exactly one bordered box, the catalog component\'s own', () => {
    renderPendingA2UI(mapSurface());

    const card = document.querySelector('[data-slot="pending-a2ui"]');
    expect(card).not.toBeNull();
    // The map's own Frame (a real, visibly bordered box) is the one box left.
    // Every wrapper this file adds between the tray and it — the removed
    // Frame, the bare A2UI chrome, the viewport — must add none of its own.
    const borderedFrames = card!.querySelectorAll('[data-slot="frame"].border');
    expect(borderedFrames).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'EarthScope stations map' })).toBeVisible();
  });

  it('single_instance_survives_fullscreen: a selection made inline is still selected inside — and after — full screen', async () => {
    const user = userEvent.setup();
    renderPendingA2UI(mapSurface());

    // Station 1 is selected by default (the first point); switch to Station 2
    // before opening full screen so a remount (which would reset to the
    // catalog component's own default) is actually observable.
    await user.click(screen.getByRole('button', { name: 'Station 2' }));
    expect(screen.getByRole('button', { name: 'Station 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Open interactive surface full screen' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    // The SAME <ClioScientificMap> instance now renders inside the dialog —
    // a remount would have reset it back to Station 1.
    expect(
      within(dialog).getByRole('button', { name: 'Station 2' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(dialog).getByRole('button', { name: 'Exit full screen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Station 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
    const maxHeight = Math.floor(window.innerHeight * 0.85);
    expect(viewport).toHaveStyle({ height: `${maxHeight}px` });
  });

  it('drag_resizes_viewport_and_persists_height: a drag survives a remount of the same surface', () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <ClioPendingInteractions
          interactions={[pendingA2UI()]}
          onResponse={vi.fn(async () => undefined)}
          surfaces={{ surface_1: actionSurface() }}
          viewedSessionId="sess_root"
        />
      </QueryClientProvider>,
    );

    const resize = screen.getByRole('button', { name: 'Resize interactive surface' });
    Object.assign(resize, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    fireEvent.pointerDown(resize, { buttons: 1, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(resize, { buttons: 1, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(resize, { clientY: 300, pointerId: 1 });
    const viewport = screen
      .getByRole('button', { name: 'Submit selection' })
      .closest('[data-slot="a2ui-response-viewport"]');
    expect(viewport).toHaveStyle({ height: '580px' });
    // Namespaced by the owning session — never a bare surface id, which two
    // sessions could otherwise collide on.
    expect(
      window.sessionStorage.getItem('clio.a2ui-viewport-height:sess_child%3Asurface_1'),
    ).toBe('580');

    unmount();
    renderPendingA2UI();
    const reopened = screen
      .getByRole('button', { name: 'Submit selection' })
      .closest('[data-slot="a2ui-response-viewport"]');
    expect(reopened).toHaveStyle({ height: '580px' });
  });

  it('corner_handle_resizes: the bottom-right corner handle also drags the viewport height', () => {
    renderPendingA2UI();

    const corner = screen.getByRole('button', { name: 'Corner resize handle' });
    Object.assign(corner, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    const viewport = screen
      .getByRole('button', { name: 'Submit selection' })
      .closest('[data-slot="a2ui-response-viewport"]');
    expect(viewport).toHaveStyle({ height: '480px' });

    fireEvent.pointerDown(corner, { buttons: 1, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(corner, { buttons: 1, clientY: 160, pointerId: 2 });
    fireEvent.pointerUp(corner, { clientY: 160, pointerId: 2 });
    expect(viewport).toHaveStyle({ height: '540px' });
  });

  it('fullscreen_dialog_opens_and_restores_height: the inline viewport keeps its height across a full-window round trip', async () => {
    const user = userEvent.setup();
    renderPendingA2UI();

    const resize = screen.getByRole('button', { name: 'Resize interactive surface' });
    Object.assign(resize, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    fireEvent.pointerDown(resize, { buttons: 1, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(resize, { buttons: 1, clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(resize, { clientY: 260, pointerId: 1 });
    const viewport = screen
      .getByRole('button', { name: 'Submit selection' })
      .closest('[data-slot="a2ui-response-viewport"]');
    expect(viewport).toHaveStyle({ height: '540px' });

    await user.click(screen.getByRole('button', { name: 'Open interactive surface full screen' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exit full screen' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(viewport).toHaveStyle({ height: '540px' });
  });
});
