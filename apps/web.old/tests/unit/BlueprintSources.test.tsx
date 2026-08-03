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
  installAgentBlueprint: ReturnType<typeof vi.fn>;
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
  const validateAgentBlueprint = vi.fn().mockResolvedValue({ ok: true, errors: [], raw: {} });
  const installAgentBlueprint = vi.fn().mockResolvedValue({ installed: [] });
  const client = {
    blueprintSources,
    addBlueprintSource,
    refreshBlueprintSource,
    deleteBlueprintSource,
    agentBlueprints,
    validateAgentBlueprint,
    installAgentBlueprint,
    ...overrides,
  } as unknown as Client;
  return {
    client,
    blueprintSources,
    addBlueprintSource,
    refreshBlueprintSource,
    deleteBlueprintSource,
    installAgentBlueprint,
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

  it('nests installed blueprints under their source provenance', async () => {
    const { client } = makeClient({
      agentBlueprints: vi.fn().mockResolvedValue({
        blueprints: [
          {
            id: 'seismic-waveform-review',
            name: 'Seismic Waveform Review',
            metadata: {
              install: {
                source: 'https://github.com/iowarp/clio-agent.git',
                source_kind: 'git',
                ref: 'develop',
                commit: '1234567890abcdef',
              },
            },
          },
        ],
      }),
    });
    render(() => <BlueprintsPage client={client} />);
    await settled();

    const sourceChildren = screen.getByTestId('blueprint-source-blueprints-src_aaa');
    expect(sourceChildren.textContent).toContain('Seismic Waveform Review');
    expect(sourceChildren.textContent).toContain('seismic-waveform-review');
    expect(sourceChildren.textContent).toContain('commit 1234567890ab');
  });

  it('prefills source/ref and installs from the source action', async () => {
    const { client, installAgentBlueprint } = makeClient();
    render(() => <BlueprintsPage client={client} />);
    await settled();

    fireEvent.click(screen.getByTestId('blueprint-source-install-src_aaa'));

    expect((screen.getByTestId('blueprint-install-input') as HTMLInputElement).value).toBe(
      'https://github.com/iowarp/clio-agent.git',
    );
    expect((screen.getByTestId('blueprint-install-ref') as HTMLInputElement).value).toBe(
      'develop',
    );
    fireEvent.click(screen.getByTestId('blueprint-install-submit'));

    await waitFor(() =>
      expect(installAgentBlueprint).toHaveBeenCalledWith({
        source: 'https://github.com/iowarp/clio-agent.git',
        ref: 'develop',
        scope: 'global',
      }),
    );
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

  it('surfaces refresh failures and restores the row action', async () => {
    const failingRefresh = vi.fn().mockRejectedValue(new Error('refresh failed'));
    const { client, blueprintSources } = makeClient({
      refreshBlueprintSource: failingRefresh,
    });
    render(() => <BlueprintsPage client={client} />);
    await settled();

    const refreshButton = screen.getByTestId('blueprint-source-refresh-src_aaa') as HTMLButtonElement;
    fireEvent.click(refreshButton);

    await waitFor(() => expect(failingRefresh).toHaveBeenCalledWith('src_aaa'));
    await waitFor(() =>
      expect(screen.getByTestId('blueprint-source-error').textContent).toContain('refresh failed'),
    );
    await waitFor(() => expect(refreshButton.disabled).toBe(false));
    expect(blueprintSources).toHaveBeenCalledTimes(1);
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
