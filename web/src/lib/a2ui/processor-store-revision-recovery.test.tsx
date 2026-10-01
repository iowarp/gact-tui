import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIO_A2UI_CATALOG_ID,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSessionRegistryOwner } from '@/test-fixtures/a2ui/v0_9_1/test-harness';
import { ClioA2UISurface } from '@/components/clio/a2ui-surface';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
  a2uiCatalogs: vi.fn(),
  a2uiCapabilities: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

beforeEach(() => {
  repository.a2uiCatalogs.mockResolvedValue({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] });
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

const SURFACE_ID = 'surface-revision-recovery';
const SESSION_ID = 'sess_1';

const createMessage = {
  version: 'v0.9.1',
  createSurface: { surfaceId: SURFACE_ID, catalogId: CLIO_A2UI_CATALOG_ID },
};

/**
 * A real `Grid` from the shipped kernel catalog (`kernel-catalog.tsx`'s
 * `gap: z.number().min(0).max(12).optional()`) — the exact client/server
 * schema drift behind #23 (G4 raises the server's bound to match; this
 * fixture keeps exercising the client's own, lower, long-standing cap so the
 * recovery path is proven against a REAL `MessageProcessor` throw, not a
 * synthetic one). The validation pass that rejects `root` runs before any
 * component in the SAME message is added, so `label` never renders either.
 */
function gridMessage(gap: number, text: string) {
  return {
    version: 'v0.9.1',
    updateComponents: {
      surfaceId: SURFACE_ID,
      components: [
        { id: 'root', component: 'Grid', gap, children: ['label'] },
        { id: 'label', component: 'Text', text },
      ],
    },
  };
}

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

describe('A2UI surface revision recovery (G2, #23/#29)', () => {
  it('renders once a corrected revision arrives after a batch that failed partway through', async () => {
    const { update } = renderSurface(a2uiSurface([createMessage, gridMessage(15, 'Grid content')], 1));

    expect(await screen.findByText('Interactive surface unavailable')).toBeVisible();

    // The server compacts the invalid `updateComponents` away (it redefines
    // the SAME component ids) and appends the corrected one — `createSurface`
    // is NOT resent, exactly like a real revision.
    update(a2uiSurface([createMessage, gridMessage(8, 'Grid content')], 2));

    expect(await screen.findByText('Grid content')).toBeVisible();
    expect(screen.queryByText('Interactive surface unavailable')).not.toBeInTheDocument();
  });

  it('never surfaces "already exists" once the surface recovers', async () => {
    const { update } = renderSurface(a2uiSurface([createMessage, gridMessage(15, 'Grid content')], 1));
    const firstFailure = await screen.findByText('Interactive surface unavailable');
    expect(firstFailure).toBeVisible();
    // The genuine validation failure, not a replay artifact.
    expect(screen.queryByText(/already exists/iu)).not.toBeInTheDocument();

    update(a2uiSurface([createMessage, gridMessage(8, 'Grid content')], 2));

    await screen.findByText('Grid content');
    expect(screen.queryByText(/already exists/iu)).not.toBeInTheDocument();
    expect(screen.queryByText('Interactive surface unavailable')).not.toBeInTheDocument();
  });

  it('applies an in-place, same-length compacted revision (a superseded update removed)', async () => {
    const before = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'root', component: 'Text', text: 'Before' }],
      },
    };
    const after = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'root', component: 'Text', text: 'After' }],
      },
    };

    const { update } = renderSurface(a2uiSurface([createMessage, before], 1));
    expect(await screen.findByText('Before')).toBeVisible();

    // Same array length (2): the server dropped `before` (it redefines the
    // same component id) and appended `after` in its place.
    update(a2uiSurface([createMessage, after], 2));

    expect(await screen.findByText('After')).toBeVisible();
    expect(screen.queryByText('Before')).not.toBeInTheDocument();
  });

  // G2 adversarial review (F2): an ordinary same-id `updateComponents` must
  // upsert onto the EXISTING model, never rebuild -- a rebuild would discard
  // the surface's own data model (a bound `TextField`'s typed value lives
  // there, not in the component's `properties`).
  it('keeps typed TextField input across an in-place, same-id revision', async () => {
    const user = userEvent.setup();
    const bindMessage = {
      version: 'v0.9.1',
      updateDataModel: { surfaceId: SURFACE_ID, path: '/name', value: '' },
    };
    const field = (label: string) => ({
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'root', component: 'TextField', label, value: { path: '/name' } }],
      },
    });

    const { update } = renderSurface(a2uiSurface([createMessage, bindMessage, field('Name')], 1));
    const input = await screen.findByLabelText('Name');
    await user.type(input, 'Alice');
    expect(input).toHaveValue('Alice');

    // The server compacts the old `field('Name')` away (same component id)
    // and appends a relabeled one -- an ordinary agent edit, not a recreate.
    update(a2uiSurface([createMessage, bindMessage, field('Full name')], 2));

    expect(await screen.findByLabelText('Full name')).toHaveValue('Alice');
  });

  it('applies a shrinking, compacted revision (several updates consolidated into one)', async () => {
    const u1 = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Row', children: ['a', 'b'] },
          { id: 'a', component: 'Text', text: 'A before' },
        ],
      },
    };
    const u2 = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'b', component: 'Text', text: 'B before' }],
      },
    };
    const u3 = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Row', children: ['a', 'b'] },
          { id: 'a', component: 'Text', text: 'A after' },
          { id: 'b', component: 'Text', text: 'B after' },
        ],
      },
    };

    const { update } = renderSurface(a2uiSurface([createMessage, u1, u2], 1));
    expect(await screen.findByText('A before')).toBeVisible();
    expect(await screen.findByText('B before')).toBeVisible();

    // `u3` redefines every id `u1`/`u2` touched, so the server consolidates
    // both into it: the array shrinks from 3 messages to 2.
    update(a2uiSurface([createMessage, u3], 2));

    expect(await screen.findByText('A after')).toBeVisible();
    expect(await screen.findByText('B after')).toBeVisible();
    expect(screen.queryByText('A before')).not.toBeInTheDocument();
    expect(screen.queryByText('B before')).not.toBeInTheDocument();
  });

  it('ignores a revision at or behind what is already applied', async () => {
    const { update } = renderSurface(a2uiSurface([createMessage, gridMessage(8, 'Original')], 2));
    expect(await screen.findByText('Original')).toBeVisible();

    // Same revision as already applied, carrying content that was NEVER
    // applied before -- if the revision gate did not fire, the fingerprint
    // diff alone would treat this as new and apply it.
    update(a2uiSurface([createMessage, gridMessage(8, 'Should not render')], 2));

    expect(screen.queryByText('Should not render')).not.toBeInTheDocument();
    expect(screen.getByText('Original')).toBeVisible();
  });

  it('rebuilds on a deleteSurface+createSurface delivered together in one reconcile', async () => {
    const before = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'root', component: 'Text', text: 'Old surface' }],
      },
    };
    const recreateMessage = {
      version: 'v0.9.1',
      createSurface: {
        surfaceId: SURFACE_ID,
        catalogId: CLIO_A2UI_CATALOG_ID,
        theme: { accent: 'rebuilt' },
      },
    };
    const after = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'root', component: 'Text', text: 'Recreated surface' }],
      },
    };

    const { update } = renderSurface(a2uiSurface([createMessage, before], 5));
    expect(await screen.findByText('Old surface')).toBeVisible();

    // The server replaces the whole record on a recreate: a fresh message
    // history with a DIFFERENT `createSurface` and a revision counter that
    // starts over -- deliberately lower than the old lifecycle's last
    // revision here, delivered as one reconcile (e.g. a session resume).
    update(a2uiSurface([recreateMessage, after], 1));

    expect(await screen.findByText('Recreated surface')).toBeVisible();
    expect(screen.queryByText('Old surface')).not.toBeInTheDocument();
    expect(screen.queryByText(/already exists/iu)).not.toBeInTheDocument();
  });
});
