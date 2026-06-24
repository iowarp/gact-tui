import type { BackendEntry } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import {
  saveRemoteBackend,
  type AddRemoteBackendRegistry,
} from '../../src/routes/AddRemoteBackendController.js';
import {
  DEFAULT_HTTP_BACKEND_URL,
  DEFAULT_SSH_REMOTE_PORT,
  INACTIVE_SSH_TUNNEL_URL,
  type AddRemoteBackendValues,
} from '../../src/routes/AddRemoteBackendModel.js';

const baseValues: AddRemoteBackendValues = {
  mode: 'http',
  label: 'Remote',
  url: DEFAULT_HTTP_BACKEND_URL,
  token: '',
  sshHost: '',
  sshUser: '',
  sshKey: '',
  sshRemotePort: DEFAULT_SSH_REMOTE_PORT,
};

function registry() {
  const entries: BackendEntry[] = [];
  const selected: string[] = [];
  const refreshCapabilities = vi.fn(async () => undefined);
  const fake: AddRemoteBackendRegistry = {
    add: (entry) => {
      entries.push(entry);
    },
    select: (id) => {
      selected.push(id);
    },
    refreshCapabilities,
  };

  return { fake, entries, selected, refreshCapabilities };
}

describe('saveRemoteBackend', () => {
  it('saves HTTP backends and refreshes capabilities through the registry', async () => {
    const reg = registry();

    const result = await saveRemoteBackend(
      { ...baseValues, label: ' Remote B ', url: ' http://127.0.0.1:18221/ ' },
      reg.fake,
      {
        isDesktop: () => false,
        openTunnel: vi.fn(),
        randomSeed: () => 'seed',
      },
    );

    expect(result.id).toBe('http:seed');
    expect(reg.entries[0]).toMatchObject({
      id: 'http:seed',
      label: 'Remote B',
      url: 'http://127.0.0.1:18221',
      kind: 'http',
    });
    expect(reg.selected).toEqual(['http:seed']);
    expect(reg.refreshCapabilities).toHaveBeenCalledWith('http:seed');
  });

  it('stores SSH config without opening a tunnel in the web build', async () => {
    const reg = registry();
    const openTunnel = vi.fn();

    await saveRemoteBackend(
      {
        ...baseValues,
        mode: 'ssh',
        label: 'Polaris',
        token: 'tok',
        sshHost: 'polaris.alcf.anl.gov',
        sshUser: 'jcernuda',
      },
      reg.fake,
      {
        isDesktop: () => false,
        openTunnel,
        randomSeed: () => 'sshseed',
      },
    );

    expect(openTunnel).not.toHaveBeenCalled();
    expect(reg.entries[0]).toMatchObject({
      id: 'ssh:sshseed',
      kind: 'ssh-tunnel',
      url: INACTIVE_SSH_TUNNEL_URL,
      bearerToken: 'tok',
    });
    expect(reg.refreshCapabilities).not.toHaveBeenCalled();
  });

  it('opens desktop SSH tunnels before refreshing capabilities', async () => {
    const reg = registry();
    const openTunnel = vi.fn(async () => ({
      local_url: 'http://127.0.0.1:30001',
      local_port: 30001,
    }));

    await saveRemoteBackend(
      {
        ...baseValues,
        mode: 'ssh',
        label: 'Polaris',
        sshHost: ' polaris.alcf.anl.gov ',
        sshUser: ' jcernuda ',
        sshKey: ' ~/.ssh/id_ed25519 ',
        sshRemotePort: ' 17801 ',
      },
      reg.fake,
      {
        isDesktop: () => true,
        openTunnel,
        randomSeed: () => 'sshseed',
      },
    );

    expect(openTunnel).toHaveBeenCalledWith({
      host: 'polaris.alcf.anl.gov',
      user: 'jcernuda',
      remote_port: 17801,
      key_path: '~/.ssh/id_ed25519',
    });
    expect(reg.entries[0]?.url).toBe('http://127.0.0.1:30001');
    expect(reg.entries[0]?.ssh).toMatchObject({ localPort: 30001 });
    expect(reg.refreshCapabilities).toHaveBeenCalledWith('ssh:sshseed');
  });
});
