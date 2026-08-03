import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryPersistence } from '@clio/core';
import { AddRemoteBackend } from '../../src/routes/AddRemoteBackend.js';
import {
  BackendRegistryProvider,
  createBackendRegistry,
} from '../../src/registry.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function hydrate() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('AddRemoteBackend', () => {
  it('saves a reachable HTTP backend and makes it current', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ contract_version: '0.2' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const registry = createBackendRegistry({
      persistence: new InMemoryPersistence({
        backends: [
          {
            id: 'old',
            label: 'Old backend',
            url: 'http://127.0.0.1:17800',
            bearerToken: '',
            kind: 'http',
          },
        ],
        currentId: 'old',
      }),
    });
    const saved = vi.fn();
    render(() => (
      <BackendRegistryProvider registry={registry}>
        <AddRemoteBackend onSaved={saved} onCancel={() => undefined} />
      </BackendRegistryProvider>
    ));
    await hydrate();

    fireEvent.input(screen.getByTestId('add-remote-label'), {
      target: { value: 'Remote B' },
    });
    fireEvent.input(screen.getByTestId('add-remote-url'), {
      target: { value: 'http://127.0.0.1:18221/' },
    });
    fireEvent.click(screen.getByTestId('add-remote-save'));

    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(registry.current()?.label).toBe('Remote B');
    expect(registry.current()?.url).toBe('http://127.0.0.1:18221');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:18221/v1/capabilities',
      expect.anything(),
    );
  });

  it('validates SSH remote port input before saving', async () => {
    const registry = createBackendRegistry({
      persistence: new InMemoryPersistence(),
    });
    const saved = vi.fn();
    render(() => (
      <BackendRegistryProvider registry={registry}>
        <AddRemoteBackend onSaved={saved} onCancel={() => undefined} />
      </BackendRegistryProvider>
    ));
    await hydrate();

    fireEvent.click(screen.getByTestId('add-remote-mode-ssh'));
    fireEvent.input(screen.getByTestId('add-remote-label'), {
      target: { value: 'Polaris' },
    });
    fireEvent.input(screen.getByTestId('add-remote-ssh-host'), {
      target: { value: 'polaris.alcf.anl.gov' },
    });
    fireEvent.input(screen.getByTestId('add-remote-ssh-user'), {
      target: { value: 'jaime' },
    });
    fireEvent.input(screen.getByTestId('add-remote-ssh-port'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByTestId('add-remote-save'));

    await waitFor(() => {
      expect(screen.getByTestId('add-remote-error').textContent).toContain(
        'Remote port must be a positive number',
      );
    });
    expect(saved).not.toHaveBeenCalled();
  });
});
