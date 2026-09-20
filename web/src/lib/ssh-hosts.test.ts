import { beforeEach, describe, expect, it } from 'vitest';
import {
  createSavedSshHost,
  profileSshHosts,
  readSavedSshHosts,
  saveSshHost,
  sshHostDestination,
  sshHostTarget,
} from './ssh-hosts';

describe('SSH hosts', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps OpenSSH profiles and manual hosts in one target shape', () => {
    const [profile] = profileSshHosts([
      { name: 'homelab', hostname: '10.0.0.102', user: 'jcernuda' },
    ]);
    expect(profile).toBeDefined();
    expect(sshHostTarget(profile!)).toEqual({
      target: 'ssh',
      ssh_profile: 'homelab',
      ssh_host: '10.0.0.102',
      ssh_user: 'jcernuda',
      ssh_auth_method: 'key',
      ssh_credential_id: 'profile:homelab',
    });

    const manual = createSavedSshHost({
      host: 'login.utah.example',
      user: 'alice',
      port: 2202,
      identityFile: 'D:/keys/id_ed25519',
      installRoot: '/mnt/common/alice/clio',
    });
    expect(sshHostDestination(manual)).toBe('alice@login.utah.example');
    expect(sshHostTarget(manual)).toEqual({
      target: 'ssh',
      ssh_host: 'login.utah.example',
      ssh_user: 'alice',
      ssh_port: 2202,
      ssh_identity_file: 'D:/keys/id_ed25519',
      install_root: '/mnt/common/alice/clio',
      ssh_auth_method: 'key',
      ssh_credential_id: 'manual:alice@login.utah.example:2202',
    });
  });

  it('persists only validated non-secret host metadata', () => {
    const host = createSavedSshHost({ host: '10.0.0.102', user: 'alice' });
    saveSshHost(host);
    expect(readSavedSshHosts()).toEqual([host]);

    window.localStorage.setItem(
      'clio.saved-ssh-hosts.v1',
      JSON.stringify([
        { id: 'bad', label: 'Missing host' },
        { ...host, port: 99_999 },
      ]),
    );
    expect(readSavedSshHosts()).toEqual([{ ...host, port: 22 }]);
  });
});
