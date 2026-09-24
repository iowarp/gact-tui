import type { A2UISurface, TransportFrame } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIO_A2UI_CATALOG_ID,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSessionRegistryOwner } from '@/test-fixtures/a2ui/v0_9_1/test-harness';
import { ClioA2UISurface } from '@/components/clio/a2ui-surface';
import { useLiveStore } from '@/store/live-store';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
  a2uiCatalogs: vi.fn(),
  a2uiCapabilities: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

beforeEach(() => {
  useLiveStore.getState().reset();
  repository.a2uiCatalogs.mockResolvedValue({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] });
  repository.a2uiCapabilities.mockResolvedValue({
    agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
    client: null,
    selection: null,
  });
});

afterEach(() => {
  cleanup();
  useLiveStore.getState().reset();
  repository.a2uiAction.mockClear();
  repository.a2uiCatalogs.mockClear();
  repository.a2uiCapabilities.mockClear();
  vi.restoreAllMocks();
});

const SURFACE_ID = 'surface-reconcile-parity';
const SESSION_ID = 'sess_1';

const createMessage = {
  version: 'v0.9.1',
  createSurface: { surfaceId: SURFACE_ID, catalogId: CLIO_A2UI_CATALOG_ID },
};
const bindMessage = {
  version: 'v0.9.1',
  updateDataModel: { surfaceId: SURFACE_ID, path: '/name', value: '' },
};
const fieldMessage = {
  version: 'v0.9.1',
  updateComponents: {
    surfaceId: SURFACE_ID,
    components: [{ id: 'root', component: 'TextField', label: 'Name', value: { path: '/name' } }],
  },
};
const extraMessage = {
  version: 'v0.9.1',
  updateDataModel: { surfaceId: SURFACE_ID, path: '/status', value: 'synced' },
};

function a2uiSurface(messages: unknown[], revision: number): A2UISurface {
  return {
    id: SURFACE_ID,
    session_id: SESSION_ID,
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision,
    state: 'ready',
    messages: messages as A2UISurface['messages'],
  };
}

function surfaceFrame(cursor: string, surface: A2UISurface): TransportFrame {
  return {
    cursor,
    eventName: 'a2ui.surface.upserted',
    receivedAt: '2026-09-17T00:00:00Z',
    data: {
      protocol_version: '0.3',
      type: 'a2ui.surface.upserted',
      occurred_at: '2026-09-17T00:00:00Z',
      scope: { connection_id: 'local', workspace_id: 'ws_1', session_id: surface.session_id },
      entity_id: surface.id,
      entity_revision: surface.revision,
      payload: surface,
    },
  };
}

function streamGapFrame(cursor: string): TransportFrame {
  return {
    cursor,
    eventName: 'stream.gap',
    receivedAt: '2026-09-17T00:00:01Z',
    data: {
      protocol_version: '0.3',
      type: 'stream.gap',
      occurred_at: '2026-09-17T00:00:01Z',
      scope: { connection_id: 'local', workspace_id: 'ws_1', session_id: SESSION_ID },
      entity_revision: 1,
      payload: {},
    },
  };
}

/** Reads the live store's own surface reactively — the shape every real caller uses. */
function LiveA2uiSurfaceHarness() {
  const surface = useLiveStore((state) => state.entities.surfaces[SURFACE_ID]);
  if (!surface) return null;
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <A2uiSessionRegistryOwner sessionId={SESSION_ID}>
        <ClioA2UISurface surface={surface} />
      </A2uiSessionRegistryOwner>
    </QueryClientProvider>
  );
}

/**
 * The prop-re-render tests in `a2ui-surface.test.tsx` prove the processor
 * store's `appliedCount` slicing directly (a hand-built `surface` prop
 * updated in place). This proves the SAME invariant end to end, through the
 * REAL live store: `applyFrames` streams the surface in, a `stream.gap`
 * frame marks the connection gapped, and `reconcileSnapshots` replaces the
 * surface with a REST transcript whose message count differs from what was
 * streamed — S8 gact-tui#409 item 3 (adversarial finding: the prop-re-render
 * tests only prove the prefix-replay mechanism, not a real reconcile).
 */
describe('processor store survives a live-store reconcile whose surface differs from the streamed prefix', () => {
  it('applies exactly the new tail when the reconciled surface has an EXTRA message, keeping typed text', async () => {
    const user = userEvent.setup();
    useLiveStore
      .getState()
      .applyFrames([surfaceFrame('1', a2uiSurface([createMessage, bindMessage, fieldMessage], 1))]);

    render(<LiveA2uiSurfaceHarness />);
    const input = await screen.findByLabelText('Name');
    await user.type(input, 'Alice');
    expect(input).toHaveValue('Alice');

    act(() => {
      useLiveStore.getState().applyFrames([streamGapFrame('2')]);
    });
    expect(useLiveStore.getState().entities.stream).toBe('gapped');

    act(() => {
      useLiveStore.getState().reconcileSnapshots({
        surfaces: {
          [SURFACE_ID]: a2uiSurface([createMessage, bindMessage, fieldMessage, extraMessage], 2),
        },
        revisions: {},
      });
    });

    // Neither double-applied (which would recreate the TextField and lose
    // the typed value) nor skipped (which would leave the extra message
    // silently unapplied forever) — the field survives the reconcile.
    expect(screen.getByLabelText('Name')).toHaveValue('Alice');
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('does not crash or double-apply when the reconciled surface has FEWER messages', async () => {
    const user = userEvent.setup();
    useLiveStore
      .getState()
      .applyFrames([surfaceFrame('1', a2uiSurface([createMessage, bindMessage, fieldMessage], 1))]);

    render(<LiveA2uiSurfaceHarness />);
    const input = await screen.findByLabelText('Name');
    await user.type(input, 'Alice');
    expect(input).toHaveValue('Alice');

    act(() => {
      useLiveStore.getState().applyFrames([streamGapFrame('2')]);
    });

    // A REST transcript that (for whatever authoritative reason) carries
    // fewer applied messages than the client already streamed — the
    // processor's appliedCount is now past the end of the new array, so
    // `.slice(appliedCount)` is empty: nothing is reprocessed, nothing
    // throws, and the already-built model (and its typed text) is untouched.
    act(() => {
      useLiveStore.getState().reconcileSnapshots({
        surfaces: { [SURFACE_ID]: a2uiSurface([createMessage, bindMessage], 2) },
        revisions: {},
      });
    });

    expect(screen.getByLabelText('Name')).toHaveValue('Alice');
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('never re-sends an already-submitted action across the gap/reconcile sequence', async () => {
    const user = userEvent.setup();
    const submitMessage = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Column', children: ['field', 'submit'] },
          { id: 'field', component: 'TextField', label: 'Name', value: { path: '/name' } },
          { id: 'submit-label', component: 'Text', text: 'Continue' },
          {
            id: 'submit',
            component: 'Button',
            child: 'submit-label',
            action: { event: { name: 'continue', context: {} } },
          },
        ],
      },
    };
    useLiveStore
      .getState()
      .applyFrames([
        surfaceFrame('1', a2uiSurface([createMessage, bindMessage, submitMessage], 1)),
      ]);

    render(<LiveA2uiSurfaceHarness />);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(repository.a2uiAction).toHaveBeenCalledTimes(1);

    act(() => {
      useLiveStore.getState().applyFrames([streamGapFrame('2')]);
      useLiveStore.getState().reconcileSnapshots({
        surfaces: {
          [SURFACE_ID]: a2uiSurface([createMessage, bindMessage, submitMessage, extraMessage], 2),
        },
        revisions: {},
      });
    });

    await screen.findByLabelText('Name');
    expect(repository.a2uiAction).toHaveBeenCalledTimes(1);
  });
});
