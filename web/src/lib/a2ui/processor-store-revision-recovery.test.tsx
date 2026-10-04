import type { A2UISurface } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

// The REAL producer's createSurface shape (F4, coordinator design 2026-10-01):
// `{surfaceId, catalogId}` only -- no `theme` injected to fake a difference.
// The lifecycle key is `surface.part_id` now, never the message's own bytes.
const createMessage = {
  version: 'v0.9.1',
  createSurface: { surfaceId: SURFACE_ID, catalogId: CLIO_A2UI_CATALOG_ID },
};

const textRoot = (text: string) => ({
  version: 'v0.9.1',
  updateComponents: {
    surfaceId: SURFACE_ID,
    components: [{ id: 'root', component: 'Text', text }],
  },
});

const setStatus = (value: string) => ({
  version: 'v0.9.1',
  updateDataModel: { surfaceId: SURFACE_ID, path: '/status', value },
});

const statusTextRoot = {
  version: 'v0.9.1',
  updateComponents: {
    surfaceId: SURFACE_ID,
    components: [{ id: 'root', component: 'Text', text: { path: '/status' } }],
  },
};

/**
 * Builds a surface carrying the modern, stamped protocol (coordinator
 * design): `part_id` plus `message_revisions`, parallel to `messages`.
 * `messageRevisions` defaults to a plain 1..N sequence -- correct whenever
 * every message in the fixture is its own distinct slot; a scenario that
 * re-stamps a MERGED slot (a component or data-model revert/fix landing on
 * an id already in the array) passes its own `messageRevisions` explicitly.
 */
function a2uiSurface(
  messages: unknown[],
  revision: number,
  options: { partId?: string; messageRevisions?: number[] } = {},
): A2UISurface {
  return {
    id: SURFACE_ID,
    session_id: SESSION_ID,
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision,
    state: 'ready',
    part_id: options.partId ?? 'part-1',
    messages: messages as A2UISurface['messages'],
    message_revisions: options.messageRevisions ?? messages.map((_, index) => index + 1),
  };
}

/**
 * F1 fallback fixture: a surface row missing `message_revisions` -- either
 * an older server that predates it entirely (no `partId` given either), or
 * M1's case: a server new enough to mint `part_id` on every `createSurface`
 * but whose row is otherwise missing stamps (e.g. 0.9.4.24, between the two
 * halves of this design landing).
 */
function legacyA2uiSurface(messages: unknown[], revision: number, partId?: string): A2UISurface {
  return {
    id: SURFACE_ID,
    session_id: SESSION_ID,
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision,
    state: 'ready',
    part_id: partId,
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

describe('A2UI surface revision recovery (G2 #23/#29; coordinator design 2026-10-01)', () => {
  // P1: a data-model revert must render the REVERTED value, not get stuck on
  // the value in between. Byte-identical content recurring (running, after
  // done) is exactly what a content-fingerprint cache gets wrong -- the
  // revert's message is identical to the FIRST `running` write, so a
  // fingerprint-keyed cache wrongly treats it as "already applied" and skips
  // it. Comparing the server's own per-slot revision stamp instead fixes it:
  // each `updateDataModel` is its own slot with its own, never-reused stamp.
  it('P1: a data-model revert (running -> done -> running) renders the reverted value', async () => {
    const { update } = renderSurface(
      a2uiSurface([createMessage, statusTextRoot, setStatus('running')], 3),
    );
    expect(await screen.findByText('running')).toBeVisible();

    update(
      a2uiSurface([createMessage, statusTextRoot, setStatus('running'), setStatus('done')], 4),
    );
    expect(await screen.findByText('done')).toBeVisible();

    update(
      a2uiSurface(
        [
          createMessage,
          statusTextRoot,
          setStatus('running'),
          setStatus('done'),
          setStatus('running'),
        ],
        5,
      ),
    );
    expect(await screen.findByText('running')).toBeVisible();
    expect(screen.queryByText('done')).not.toBeInTheDocument();
  });

  // P2: same defect, one layer down -- a COMPONENT revert through the single
  // merged `updateComponents` slot (materialization, iowarp/clio-agent#1553:
  // the server never keeps more than one `updateComponents` message per
  // surface). The third write's merged content is byte-identical to the
  // first's, so only the stamp -- not the bytes -- tells them apart.
  it('P2: a component revert (A -> B -> A) through the merged slot renders the reverted value', async () => {
    const { update } = renderSurface(
      a2uiSurface([createMessage, textRoot('A')], 2, { messageRevisions: [1, 2] }),
    );
    expect(await screen.findByText('A')).toBeVisible();

    update(a2uiSurface([createMessage, textRoot('B')], 3, { messageRevisions: [1, 3] }));
    expect(await screen.findByText('B')).toBeVisible();

    update(a2uiSurface([createMessage, textRoot('A')], 4, { messageRevisions: [1, 4] }));
    expect(await screen.findByText('A')).toBeVisible();
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  // P3 (F2/F3): a Grid fixed to gap 8, then "fixed" again to the
  // client-rejected gap 15 (server-accepted at the 0.5.1 pin) -- the merged
  // slot's stamp moves forward, so the WHOLE slot is re-applied component by
  // component. `root` (the bad Grid) throws and is SKIPPED: its previous,
  // still-good definition (gap 8) is left exactly as it was -- the failed
  // sub-message's mutation pass never ran. `label` (untouched, always valid)
  // still re-applies as a no-op. The surface renders its stale-but-valid
  // state, with an inline notice AND a VALIDATION_FAILED report -- never the
  // full failure card, since a renderable root remains throughout.
  it('P3: a still-bad merged update is skipped, keeping the stale value, with an inline notice and a VALIDATION_FAILED report', async () => {
    const good = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Grid', gap: 8, children: ['label'] },
          { id: 'label', component: 'Text', text: 'Grid stable' },
        ],
      },
    };
    const bad = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Grid', gap: 15, children: ['label'] },
          { id: 'label', component: 'Text', text: 'Grid stable' },
        ],
      },
    };

    const { update } = renderSurface(
      a2uiSurface([createMessage, good], 2, { messageRevisions: [1, 2] }),
    );
    expect(await screen.findByText('Grid stable')).toBeVisible();

    update(a2uiSurface([createMessage, bad], 3, { messageRevisions: [1, 3] }));

    expect(await screen.findByText('Grid stable')).toBeVisible();
    expect(screen.queryByText('Interactive surface unavailable')).not.toBeInTheDocument();
    expect(await screen.findByText(/could not be validated and was skipped/iu)).toBeVisible();
    await waitFor(() => expect(repository.a2uiAction).toHaveBeenCalled());
    const lastCall = repository.a2uiAction.mock.calls.at(-1) as [string, { error?: { code?: string } }];
    expect(lastCall[1].error?.code).toBe('VALIDATION_FAILED');
  });

  // P4b: a merged shape where ONE sibling (`b`) was never valid at all (an
  // orphan reference `root` -> [a, b], `b` a bad Grid) -- `a` ("Alpha")
  // still renders, `b` is skipped and reported, and the surface is never
  // the full failure card, because `root` itself (and `a`) resolved fine.
  it('P4b: an orphan bad component in a merged shape is skipped and reported; its siblings still render', async () => {
    const dashboard = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Row', children: ['a', 'b'] },
          { id: 'a', component: 'Text', text: 'Alpha' },
          { id: 'b', component: 'Grid', gap: 15, children: [] },
        ],
      },
    };

    renderSurface(a2uiSurface([createMessage, dashboard], 2, { messageRevisions: [1, 2] }));

    expect(await screen.findByText('Alpha')).toBeVisible();
    expect(screen.queryByText('Interactive surface unavailable')).not.toBeInTheDocument();
    expect(await screen.findByText(/could not be validated and was skipped/iu)).toBeVisible();
  });

  // P5 (F4): a REST reconcile delivering a RECREATED record -- a fresh
  // `part_id` at revision 2 -- after the OLD lifecycle sat at revision 5.
  // The revision number alone would say "stale, ignore" (2 <= 5); the
  // part_id says otherwise, and it wins: a recreate always rebuilds,
  // regardless of its revision number, since the server's counter restarts
  // for it. Uses the real producer's createSurface shape throughout (no
  // injected `theme` -- the OLD design needed one to force a content-hash
  // difference; `part_id` makes that unnecessary).
  it('P5: a recreated record (fresh part_id) rebuilds even at a LOWER revision than the old lifecycle', async () => {
    const { update } = renderSurface(
      a2uiSurface([createMessage, textRoot('Old surface')], 5, {
        partId: 'part-1',
        messageRevisions: [1, 5],
      }),
    );
    expect(await screen.findByText('Old surface')).toBeVisible();

    update(
      a2uiSurface([createMessage, textRoot('Recreated surface')], 2, {
        partId: 'part-2',
        messageRevisions: [1, 2],
      }),
    );

    expect(await screen.findByText('Recreated surface')).toBeVisible();
    expect(screen.queryByText('Old surface')).not.toBeInTheDocument();
    expect(screen.queryByText(/already exists/iu)).not.toBeInTheDocument();
  });

  // F2 (unchanged from the prior design's own regression coverage): an
  // ordinary same-id `updateComponents` must upsert onto the EXISTING
  // model, never rebuild -- a rebuild would discard the surface's own data
  // model (a bound `TextField`'s typed value lives there, not in the
  // component's `properties`).
  it('keeps typed TextField input across an in-place, same-id revision (merged slot re-stamped)', async () => {
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

    const { update } = renderSurface(
      a2uiSurface([createMessage, bindMessage, field('Name')], 2, { messageRevisions: [1, 2, 2] }),
    );
    const input = await screen.findByLabelText('Name');
    await user.type(input, 'Alice');
    expect(input).toHaveValue('Alice');

    // Same merged slot, relabeled -- an ordinary agent edit, not a recreate.
    update(
      a2uiSurface([createMessage, bindMessage, field('Full name')], 3, {
        messageRevisions: [1, 2, 3],
      }),
    );

    expect(await screen.findByLabelText('Full name')).toHaveValue('Alice');
  });

  it('keeps legacy form input when an unchanged surface rerenders without part IDs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const messages = [createMessage, {
      version: 'v0.9.1',
      updateDataModel: { surfaceId: SURFACE_ID, path: '/name', value: '' },
    }, {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [{ id: 'root', component: 'TextField', label: 'Name', value: { path: '/name' } }],
      },
    }];
    const { update } = renderSurface(legacyA2uiSurface(messages, 3));
    await userEvent.setup().type(await screen.findByLabelText('Name'), 'Alice');
    update(legacyA2uiSurface(messages, 3));
    expect(screen.getByLabelText('Name')).toHaveValue('Alice');
  });

  it('ignores a revision at or behind what is already applied', async () => {
    const { update } = renderSurface(
      a2uiSurface([createMessage, textRoot('Original')], 2, { messageRevisions: [1, 2] }),
    );
    expect(await screen.findByText('Original')).toBeVisible();

    // Same revision as already applied, carrying content that was NEVER
    // applied before -- the revision gate must fire regardless of content.
    update(
      a2uiSurface([createMessage, textRoot('Should not render')], 2, {
        messageRevisions: [1, 2],
      }),
    );

    expect(screen.queryByText('Should not render')).not.toBeInTheDocument();
    expect(screen.getByText('Original')).toBeVisible();
  });

  // F1: a server that predates `message_revisions`/`part_id` (an older
  // pinned clio-agent) cannot be incrementally trusted -- the client falls
  // back to a full rebuild on each revision that moves forward, reporting
  // the degradation visibly (console plus the existing local-notice door),
  // never silently.
  it('falls back to a full rebuild, with a visible typed degradation, against a server without revision stamps', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { update } = renderSurface(legacyA2uiSurface([createMessage, textRoot('First')], 2));
    expect(await screen.findByText('First')).toBeVisible();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[A2UI]'));
    // L1: worded from what is actually MISSING, never "an older version" --
    // and plainly states unsubmitted input is lost on each change.
    expect(
      await screen.findByText(/missing what incremental updates need/iu),
    ).toBeVisible();
    expect(screen.getByText(/lost each time/iu)).toBeVisible();

    update(legacyA2uiSurface([createMessage, textRoot('Second')], 3));
    expect(await screen.findByText('Second')).toBeVisible();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  // M1 (adversarial re-review): the stamp-less fallback branch used to check
  // "revision <= appliedRevision" BEFORE noticing `part_id` had changed, so
  // a recreate delivered at a LOWER revision than the old lifecycle (the
  // server's counter restarts on recreate) was silently ignored as "stale"
  // against a server new enough to mint `part_id` but still missing
  // `message_revisions` (e.g. 0.9.4.24, between the two halves of this
  // design landing).
  it('M1: detects a recreate (fresh part_id) on the stamp-less fallback path, even at a LOWER revision', async () => {
    const { update } = renderSurface(
      legacyA2uiSurface([createMessage, textRoot('Old surface')], 5, 'part-1'),
    );
    expect(await screen.findByText('Old surface')).toBeVisible();

    update(legacyA2uiSurface([createMessage, textRoot('Recreated surface')], 2, 'part-2'));

    expect(await screen.findByText('Recreated surface')).toBeVisible();
    expect(screen.queryByText('Old surface')).not.toBeInTheDocument();
  });

  // M2 (adversarial re-review): the merged slot is re-applied wholesale on
  // every component change, so an UNCHANGED bad component re-validates --
  // and would re-POST a fresh VALIDATION_FAILED -- on every unrelated
  // sibling edit, re-driving the agent's one-repair-per-revision budget
  // (S5) for nothing. One bad `root`, created once, followed by three
  // unrelated edits to a sibling, must produce exactly ONE POST.
  it('M2: an unchanged bad component is reported only once across unrelated edits', async () => {
    const bad = {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Row', children: ['a', 'b'] },
          { id: 'a', component: 'Text', text: 'Alpha' },
          { id: 'b', component: 'Grid', gap: 15, children: [] },
        ],
      },
    };
    const editA = (text: string) => ({
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: SURFACE_ID,
        components: [
          { id: 'root', component: 'Row', children: ['a', 'b'] },
          { id: 'a', component: 'Text', text },
          { id: 'b', component: 'Grid', gap: 15, children: [] },
        ],
      },
    });

    const { update } = renderSurface(a2uiSurface([createMessage, bad], 2, { messageRevisions: [1, 2] }));
    expect(await screen.findByText('Alpha')).toBeVisible();
    await waitFor(() => expect(repository.a2uiAction).toHaveBeenCalledTimes(1));

    update(a2uiSurface([createMessage, editA('Alpha 2')], 3, { messageRevisions: [1, 3] }));
    expect(await screen.findByText('Alpha 2')).toBeVisible();

    update(a2uiSurface([createMessage, editA('Alpha 3')], 4, { messageRevisions: [1, 4] }));
    expect(await screen.findByText('Alpha 3')).toBeVisible();

    update(a2uiSurface([createMessage, editA('Alpha 4')], 5, { messageRevisions: [1, 5] }));
    expect(await screen.findByText('Alpha 4')).toBeVisible();

    // The inline notice still fires every time `b` fails -- only the POST
    // (the repair-lane-facing door) is deduplicated.
    expect(await screen.findByText(/could not be validated and was skipped/iu)).toBeVisible();
    expect(repository.a2uiAction).toHaveBeenCalledTimes(1);
  });
});
