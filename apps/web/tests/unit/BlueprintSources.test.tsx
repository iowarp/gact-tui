/**
 * A3 — Agent blueprint *sources* management panel (lives inline on the
 * Agent blueprints page).
 *
 *  - Lists registered sources with name, source url, ref, a status dot,
 *    and the status_message.
 *  - Empty state when no sources are registered.
 *  - Add-source form validates a non-empty source and calls
 *    addBlueprintSource with {source, ref?, name?}; 400 validation errors
 *    surface inline.
 *  - Per-row Refresh / Remove call the matching client methods and refetch.
 *
 * Mocks the @clio/core Client as a partial fake (only the four blueprint-
 * source methods + agentBlueprints, which the host page also reads).
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlueprintSource, Client } from '@clio/core';
import { BlueprintsPage } from '../../src/routes/discovery/RoadmapPages.js';

afterEach(cleanup);

beforeEach(() => {
  // The Remove action uses window.confirm — auto-accept in tests.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

const SOURCES: BlueprintSource[] = [
  {
    id: 'src_aaa',
    name: 'iowarp blueprints',
    source: 'https://github.com/iowarp/clio-agent.git',
    ref: 'develop',
    status: 'ready',
    status_message: '',
  },
  {
    id: 'src_bbb',
    name: 'broken registry',
    source: '/tmp/missing',
    status: 'error',
    status_message: 'path not found',
  },
];

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}): {
  client: Client;
  blueprintSources: ReturnType<typeof vi.fn>;
  addBlueprintSource: ReturnType<typeof vi.fn>;
  refreshBlueprintSource: ReturnType<typeof vi.fn>;
  deleteBlueprintSource: ReturnType<typeof vi.fn>;
} {
  const blueprintSources = vi.fn().mockResolvedValue({ sources: SOURCES });
  const addBlueprintSource = vi
    .fn()
    .mockResolvedValue({ source: { ...SOURCES[0], id: 'src_new' } });
  const refreshBlueprintSource = vi
    .fn()
    .mockResolvedValue({ source: { ...SOURCES[0], status: 'ready' } });
  const deleteBlueprintSource = vi.fn().mockResolvedValue(undefined);
  const agentBlueprints = vi.fn().mockResolvedValue({ blueprints: [] });
  const client = {
    blueprintSources,
    addBlueprintSource,
    refreshBlueprintSource,
    deleteBlueprintSource,
    agentBlueprints,
    ...overrides,
  } as unknown as Client;
  return {
    client,
    blueprintSources,
    addBlueprintSource,
    refreshBlueprintSource,
    deleteBlueprintSource,
  };
}

async function settled() {
  await waitFor(() => expect(screen.queryByTestId('blueprint-source-row-src_aaa')).toBeTruthy());
}

describe('A3 — blueprint sources list', () => {
  it('renders a row per source with name, source url, ref, and status message', async () => {
    const { client } = makeClient();
    render(() => <BlueprintsPage client={client} />);
    await settled();

    const row = screen.getByTestId('blueprint-source-row-src_aaa');
    expect(row.textContent).toContain('iowarp blueprints');
    expect(row.textContent).toContain('https://github.com/iowarp/clio-agent.git');
    expect(row.textContent).toContain('@develop');

    const errRow = screen.getByTestId('blueprint-source-row-src_bbb');
    expect(errRow.textContent).toContain('path not found');
  });

  it('shows the empty state when there are no sources', async () => {
    const { client } = makeClient({
      blueprintSources: vi.fn().mockResolvedValue({ sources: [] }),
    });
    render(() => <BlueprintsPage client={client} />);
    await waitFor(() =>
      expect(screen.queryByTestId('blueprint-sources-empty')).toBeTruthy(),
    );
    expect(screen.queryByTestId('blueprint-source-row-src_aaa')).toBeNull();
  });
});

describe('A3 — add source', () => {
  it('blocks an empty source and surfaces the validation message inline', async () => {
    const { client, addBlueprintSource } = makeClient();
    render(() => <BlueprintsPage client={client} />);
    await settled();

    fireEvent.submit(screen.getByTestId('blueprint-source-add-form'));
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-source-error').textContent).toMatch(/git URL/i),
    );
    expect(addBlueprintSource).not.toHaveBeenCalled();
  });

  it('submits source + optional ref + name and refetches', async () => {
    const { client, addBlueprintSource, blueprintSources } = makeClient();
    render(() => <BlueprintsPage client={client} />);
    await settled();

    fireEvent.input(screen.getByTestId('blueprint-source-input'), {
      target: { value: 'https://github.com/org/bp.git' },
    });
    fireEvent.input(screen.getByTestId('blueprint-source-ref'), {
      target: { value: 'main' },
    });
    fireEvent.input(screen.getByTestId('blueprint-source-name'), {
      target: { value: 'my reg' },
    });
    fireEvent.submit(screen.getByTestId('blueprint-source-add-form'));

    await waitFor(() =>
      expect(addBlueprintSource).toHaveBeenCalledWith({
        source: 'https://github.com/org/bp.git',
        ref: 'main',
        name: 'my reg',
      }),
    );
    // One initial load + one refetch after add.
    await waitFor(() => expect(blueprintSources).toHaveBeenCalledTimes(2));
  });

  it('surfaces a 400 validation error from the backend inline', async () => {
    const { client } = makeClient({
      addBlueprintSource: vi
        .fn()
        .mockRejectedValue(new Error('validation_error: source or url is required')),
    });
    render(() => <BlueprintsPage client={client} />);
    await settled();

    fireEvent.input(screen.getByTestId('blueprint-source-input'), {
      target: { value: 'x' },
    });
    fireEvent.submit(screen.getByTestId('blueprint-source-add-form'));
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-source-error').textContent).toContain(
        'source or url is required',
      ),
    );
  });
});

describe('A3 — per-row actions', () => {
  it('refresh calls refreshBlueprintSource(id) and refetches', async () => {
    const { client, refreshBlueprintSource, blueprintSources } = makeClient();
    render(() => <BlueprintsPage client={client} />);
    await settled();

    fireEvent.click(screen.getByTestId('blueprint-source-refresh-src_aaa'));
    await waitFor(() =>
      expect(refreshBlueprintSource).toHaveBeenCalledWith('src_aaa'),
    );
    await waitFor(() => expect(blueprintSources).toHaveBeenCalledTimes(2));
  });

  it('remove confirms then calls deleteBlueprintSource(id) and refetches', async () => {
    const { client, deleteBlueprintSource, blueprintSources } = makeClient();
    render(() => <BlueprintsPage client={client} />);
    await settled();

    fireEvent.click(screen.getByTestId('blueprint-source-remove-src_bbb'));
    await waitFor(() =>
      expect(deleteBlueprintSource).toHaveBeenCalledWith('src_bbb'),
    );
    await waitFor(() => expect(blueprintSources).toHaveBeenCalledTimes(2));
  });
});
