import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  read: vi.fn(),
  store: vi.fn(),
  remove: vi.fn(),
  waitForManagedBackend: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@/tauri/secure-credentials', () => ({
  readConnectionCredential: mocks.read,
  storeConnectionCredential: mocks.store,
  deleteConnectionCredential: mocks.remove,
}));
vi.mock('@/tauri/managed-backend', () => ({
  waitForManagedBackend: mocks.waitForManagedBackend,
}));

import { ConnectionProvider, useConnectionSettings } from './connection-provider';

function ConnectionState() {
  const context = useConnectionSettings();
  const { credentialsReady, credentialError, recents, settings } = context;
  return (
    <div>
      <output aria-label="credential state">
        {credentialsReady ? 'ready' : 'loading'}
        {credentialError ? `: ${credentialError}` : ''}
      </output>
      <output aria-label="active token">{settings.token ?? 'none'}</output>
      <output aria-label="active endpoint">{settings.endpoint}</output>
      <output aria-label="managed connection">
        {context.managedConnectionReady ? 'managed' : 'saved'}
      </output>
      <output aria-label="recent count">{recents.length}</output>
      <button
        onClick={() =>
          void context.connect({
            endpoint: 'http://agent.local/',
            label: 'Lab agent',
            token: 'saved-secret',
          })
        }
        type="button"
      >
        Remember lab agent
      </button>
      <button onClick={() => void context.forget('http://agent.local')} type="button">
        Forget lab agent
      </button>
    </div>
  );
}

describe('connection provider credentials', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.inTauri.mockReset();
    mocks.read.mockReset();
    mocks.store.mockReset();
    mocks.remove.mockReset();
    mocks.waitForManagedBackend.mockReset();
  });

  afterEach(cleanup);

  it('keeps browser connections ready without loading a native credential', () => {
    mocks.inTauri.mockReturnValue(false);

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );

    expect(screen.getByLabelText('credential state')).toHaveTextContent('ready');
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('hydrates the most recent installed-app connection before marking it ready', async () => {
    localStorage.setItem(
      'clio.recent-connections',
      JSON.stringify([{ endpoint: 'http://agent.local', label: 'Lab agent' }]),
    );
    mocks.inTauri.mockReturnValue(true);
    let releaseCredential: (value: string) => void = () => undefined;
    mocks.read.mockReturnValue(
      new Promise<string>((resolve) => {
        releaseCredential = resolve;
      }),
    );

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );

    expect(screen.getByLabelText('credential state')).toHaveTextContent('loading');
    expect(screen.getByLabelText('active token')).toHaveTextContent('none');
    await act(async () => {
      releaseCredential('saved-secret');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('credential state')).toHaveTextContent('ready');
      expect(screen.getByLabelText('active token')).toHaveTextContent('saved-secret');
    });
    expect(mocks.read).toHaveBeenCalledWith('http://agent.local');
    expect(mocks.waitForManagedBackend).not.toHaveBeenCalled();
  });

  it('uses the supervisor endpoint and bearer token when the installed app has no recents', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.waitForManagedBackend.mockResolvedValue({
      url: 'http://127.0.0.1:17800',
      bearer_token: 'supervisor-token',
      status: { kind: 'ready' },
    });

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );

    expect(screen.getByLabelText('credential state')).toHaveTextContent('loading');
    await waitFor(() => {
      expect(screen.getByLabelText('credential state')).toHaveTextContent('ready');
      expect(screen.getByLabelText('active endpoint')).toHaveTextContent('http://127.0.0.1:17800');
      expect(screen.getByLabelText('active token')).toHaveTextContent('supervisor-token');
      expect(screen.getByLabelText('managed connection')).toHaveTextContent('managed');
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('uses an unauthenticated supervisor endpoint without consulting secure storage', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.waitForManagedBackend.mockResolvedValue({
      url: 'http://127.0.0.1:17800',
      bearer_token: '',
      status: { kind: 'ready' },
    });
    mocks.read.mockRejectedValue(new Error('credential service unavailable'));

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('credential state')).toHaveTextContent('ready');
      expect(screen.getByLabelText('active endpoint')).toHaveTextContent('http://127.0.0.1:17800');
      expect(screen.getByLabelText('active token')).toHaveTextContent('none');
      expect(screen.getByLabelText('managed connection')).toHaveTextContent('managed');
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('publishes credential-store failures instead of silently retrying without a token', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.waitForManagedBackend.mockRejectedValue(new Error('Credential vault is locked'));
    mocks.read.mockRejectedValue(new Error('Credential vault is locked'));

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('credential state')).toHaveTextContent(
        'ready: Credential vault is locked',
      );
    });
  });

  it('stores and removes the token with the remembered connection', async () => {
    mocks.inTauri.mockReturnValue(true);
    localStorage.setItem(
      'clio.recent-connections',
      JSON.stringify([{ endpoint: 'http://existing.local', label: 'Existing' }]),
    );
    mocks.read.mockResolvedValue('saved-secret');
    mocks.store.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText('credential state')).toHaveTextContent('ready'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remember lab agent' }));

    await waitFor(() => {
      expect(mocks.store).toHaveBeenCalledWith('http://agent.local', 'saved-secret');
      expect(screen.getByLabelText('recent count')).toHaveTextContent('1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Forget lab agent' }));

    await waitFor(() => {
      expect(mocks.remove).toHaveBeenCalledWith('http://agent.local');
      expect(screen.getByLabelText('recent count')).toHaveTextContent('1');
    });
  });
});
