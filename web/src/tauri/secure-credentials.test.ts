import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import {
  deleteConnectionCredential,
  readConnectionCredential,
  storeConnectionCredential,
} from './secure-credentials';

describe('secure credential bridge', () => {
  beforeEach(() => {
    mocks.inTauri.mockReset();
    mocks.invoke.mockReset();
  });

  it('keeps browser sessions memory-only', async () => {
    mocks.inTauri.mockReturnValue(false);

    await expect(readConnectionCredential('http://agent.local')).resolves.toBeUndefined();
    await storeConnectionCredential('http://agent.local', 'secret');
    await deleteConnectionCredential('http://agent.local');

    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('uses the native credential commands without exposing the token elsewhere', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValueOnce('secret').mockResolvedValue(undefined);

    await expect(readConnectionCredential('http://agent.local')).resolves.toBe('secret');
    await storeConnectionCredential('http://agent.local', 'secret');
    await deleteConnectionCredential('http://agent.local');

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'credential_read', {
      endpoint: 'http://agent.local',
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'credential_store', {
      endpoint: 'http://agent.local',
      secret: 'secret',
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, 'credential_delete', {
      endpoint: 'http://agent.local',
    });
  });

  it('preserves the native failure reason as an Error', async () => {
    mocks.inTauri.mockReturnValue(true);
    mocks.invoke.mockRejectedValue('The system credential vault is locked');

    await expect(readConnectionCredential('http://agent.local')).rejects.toThrow(
      'The system credential vault is locked',
    );
  });
});
