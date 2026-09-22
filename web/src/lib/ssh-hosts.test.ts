import { describe, expect, it } from 'vitest';
import { createSavedSshHost, profileSshHosts, sshHostDestination } from './ssh-hosts';

describe('SSH hosts', () => {
  it('keeps OpenSSH profiles and manual hosts in one target shape', () => {
    const [profile] = profileSshHosts([
      { name: 'homelab', hostname: '10.0.0.102', user: 'jcernuda' },
    ]);
    expect(profile).toBeDefined();
    expect(profile).toMatchObject({
      profile: 'homelab',
      host: '10.0.0.102',
      user: 'jcernuda',
    });

    const manual = createSavedSshHost({
      host: 'login.utah.example',
      user: 'alice',
      port: 2202,
      identityFile: 'D:/keys/id_ed25519',
      installRoot: '/mnt/common/alice/clio',
    });
    expect(sshHostDestination(manual)).toBe('alice@login.utah.example');
    expect(manual).toMatchObject({
      host: 'login.utah.example',
      user: 'alice',
      port: 2202,
      identityFile: 'D:/keys/id_ed25519',
      installRoot: '/mnt/common/alice/clio',
    });
  });

  it('preserves resolved jump-chain and platform metadata', () => {
    const [profile] = profileSshHosts([
      {
        name: 'polaris',
        hostname: 'polaris.alcf.anl.gov',
        port: 22,
        jump_hosts: ['bastion', 'gateway'],
        platform: 'linux',
        managed: true,
      },
    ]);
    expect(profile).toMatchObject({
      jumpHosts: ['bastion', 'gateway'],
      platform: 'linux',
      managed: true,
    });
  });
});
