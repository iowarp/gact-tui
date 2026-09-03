import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ inTauri: vi.fn(), invoke: vi.fn() }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { deployWebSearch, sshProfiles } from './infrastructure-setup';

describe('infrastructure setup bridge', () => {
  beforeEach(() => {
    mocks.inTauri.mockReset();
    mocks.invoke.mockReset();
  });

  it('keeps SSH inventory unavailable in a plain browser', async () => {
    mocks.inTauri.mockReturnValue(false);
    await expect(sshProfiles()).resolves.toEqual([]);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('uses the desktop bridge for a selected deployment', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({ action: 'created', target: 'homelab' });
    await expect(
      deployWebSearch({ target: 'ssh', ssh_profile: 'homelab', contact_email: 'a@example.org' }),
    ).resolves.toEqual({ action: 'created', target: 'homelab' });
    expect(mocks.invoke).toHaveBeenCalledWith('infrastructure_deploy_web_search', {
      request: {
        target: 'ssh',
        ssh_profile: 'homelab',
        contact_email: 'a@example.org',
      },
    });
  });
});
