import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import { ToastProvider } from '../../src/components/Toast.js';
import { SessionDefaultsSection } from '../../src/routes/SettingsShell.js';
import {
  SESSION_DEFAULT_BLUEPRINT_KEY,
  SESSION_DEFAULT_EXPERT_PACK_KEY,
} from '../../src/session-semantics.js';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
});

function makeClient() {
  const agentBlueprints = vi.fn().mockResolvedValue({
    blueprints: [
      {
        id: 'earthscope-gnss-region',
        name: 'EarthScope GNSS',
        description: 'Pulls station time series and plots motion.',
      },
    ],
  });
  const expertPacks = vi.fn().mockResolvedValue({
    packs: [
      {
        id: 'ndp-tools',
        name: 'NDP Tools',
        description: 'NDP data access helpers.',
      },
    ],
  });
  return {
    client: { agentBlueprints, expertPacks } as unknown as Client,
    agentBlueprints,
    expertPacks,
  };
}

function renderSection(client: Client) {
  return render(() => (
    <ToastProvider>
      <SessionDefaultsSection
        client={client}
        context={{ workspaceId: 'ws_earthscope' }}
      />
    </ToastProvider>
  ));
}

describe('SessionDefaultsSection', () => {
  it('loads catalogs with active workspace scope and persists selections', async () => {
    const { client, agentBlueprints, expertPacks } = makeClient();
    renderSection(client);

    const blueprintSelect = await waitFor(() => {
      const select = screen.getByTestId(
        'session-default-blueprint',
      ) as HTMLSelectElement;
      if (select.options.length < 1) throw new Error('blueprints not loaded yet');
      expect(select.value).toBe('earthscope-gnss-region');
      expect(select.options[0]?.textContent).toBe('EarthScope');
      return select;
    });
    expect(agentBlueprints).toHaveBeenCalledWith({
      workspace_id: 'ws_earthscope',
    });
    expect(expertPacks).toHaveBeenCalledWith({
      workspace_id: 'ws_earthscope',
    });

    expect(screen.queryByTestId('session-default-expert-pack')).toBeNull();
    fireEvent.change(blueprintSelect, {
      target: { value: 'earthscope-gnss-region' },
    });
    fireEvent.click(screen.getByTestId('session-defaults-save'));

    await waitFor(() =>
      expect(localStorage.getItem(SESSION_DEFAULT_BLUEPRINT_KEY)).toBe(
        'earthscope-gnss-region',
      ),
    );
    expect(localStorage.getItem(SESSION_DEFAULT_EXPERT_PACK_KEY)).toBeNull();
  });

  it('clears stale saved defaults when the current catalogs do not contain them', async () => {
    localStorage.setItem(SESSION_DEFAULT_BLUEPRINT_KEY, 'old-blueprint');
    localStorage.setItem(SESSION_DEFAULT_EXPERT_PACK_KEY, 'old-pack');
    const { client } = makeClient();
    renderSection(client);

    await waitFor(() => {
      const select = screen.getByTestId(
        'session-default-blueprint',
      ) as HTMLSelectElement;
      expect(select.value).toBe('');
    });
    expect(screen.queryByTestId('session-default-expert-pack')).toBeNull();

    fireEvent.click(screen.getByTestId('session-defaults-save'));
    expect(localStorage.getItem(SESSION_DEFAULT_BLUEPRINT_KEY)).toBeNull();
    expect(localStorage.getItem(SESSION_DEFAULT_EXPERT_PACK_KEY)).toBeNull();
  });
});
