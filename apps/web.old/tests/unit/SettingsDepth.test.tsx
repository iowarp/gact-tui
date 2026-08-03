/**
 * W3 Tier-1 — settings depth.
 *
 *  - Notification prefs persist and gate reactively.
 *  - Per-backend Test connection probes /v1/capabilities and surfaces
 *    latency or the failure inline.
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifPrefs, setNotifPref } from '../../src/notif-prefs.js';
import { SettingsBackends } from '../../src/routes/SettingsBackends.js';
import {
  BackendRegistryProvider,
  createBackendRegistry,
} from '../../src/registry.js';
import { InMemoryPersistence, type BackendEntry } from '@clio/core';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('notification preferences', () => {
  it('defaults to everything on', () => {
    expect(notifPrefs().turnCompletions).toBe(true);
    expect(notifPrefs().connectionStatus).toBe(true);
  });

  it('setNotifPref flips the signal and persists to localStorage', () => {
    setNotifPref('turnCompletions', false);
    expect(notifPrefs().turnCompletions).toBe(false);
    const raw = JSON.parse(localStorage.getItem('clio.notif-prefs.v1') ?? '{}');
    expect(raw.turnCompletions).toBe(false);
    // Restore — the module-level signal persists across tests in this file.
    setNotifPref('turnCompletions', true);
  });
});

function backendsHarness(entry: BackendEntry) {
  const persistence = new InMemoryPersistence({
    backends: [entry],
    currentId: entry.id,
  });
  return createBackendRegistry({ persistence });
}

function emptyBackendsHarness() {
  const persistence = new InMemoryPersistence({
    backends: [],
    currentId: '',
  });
  return createBackendRegistry({ persistence });
}

async function hydrate() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('SettingsBackends test-connection', () => {
  it('uses brand-neutral copy for the empty backend state', async () => {
    const registry = emptyBackendsHarness();
    render(() => (
      <BackendRegistryProvider registry={registry}>
        <SettingsBackends onAddRemote={() => undefined} onBack={() => undefined} />
      </BackendRegistryProvider>
    ));
    await hydrate();

    const body = screen.getByTestId('settings-backends').textContent ?? '';
    expect(body).toContain('bundled agent backend');
    expect(body).not.toContain('clio-agent-gact');
  });

  it('shows ok + latency when the probe succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ contract_version: '0.2' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const registry = backendsHarness({
      id: 'test:one',
      label: 'Test backend',
      url: 'http://127.0.0.1:9999',
      bearerToken: '',
      kind: 'http',
    });
    render(() => (
      <BackendRegistryProvider registry={registry}>
        <SettingsBackends onAddRemote={() => undefined} onBack={() => undefined} />
      </BackendRegistryProvider>
    ));
    await hydrate();

    fireEvent.click(screen.getByTestId('settings-row-test-test:one'));
    await waitFor(() => {
      const result = screen.getByTestId('settings-row-test-result-test:one');
      expect(result.textContent).toMatch(/ok · \d+ms/);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/v1/capabilities',
      expect.anything(),
    );
  });

  it('shows failed when the probe rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );
    const registry = backendsHarness({
      id: 'test:two',
      label: 'Down backend',
      url: 'http://127.0.0.1:9998',
      bearerToken: '',
      kind: 'http',
    });
    render(() => (
      <BackendRegistryProvider registry={registry}>
        <SettingsBackends onAddRemote={() => undefined} onBack={() => undefined} />
      </BackendRegistryProvider>
    ));
    await hydrate();

    fireEvent.click(screen.getByTestId('settings-row-test-test:two'));
    await waitFor(() => {
      const result = screen.getByTestId('settings-row-test-result-test:two');
      expect(result.textContent).toBe('failed');
    });
  });
});
