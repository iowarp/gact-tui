import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClioRepository } from '@clio/core/v3';
const fixture = vi.hoisted(() => ({ invoke: vi.fn(), open: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: fixture.invoke }));
vi.mock('./external-url', () => ({ openExternalUrl: fixture.open }));
import { signInToStorage } from './storage-oauth';

beforeEach(() => vi.resetAllMocks());
describe('Desktop storage browser return', () => {
  it('completes only on the initiating repository and closes the local receiver', async () => {
    fixture.invoke.mockImplementation((command: string) =>
      command === 'storage_oauth_listen'
        ? Promise.resolve({
            id: 'receiver',
            redirect_uri: 'http://127.0.0.1:48173/clio-storage-return',
          })
        : Promise.resolve('http://127.0.0.1:48173/clio-storage-return?state=bound&code=private'),
    );
    const startSourceSignIn = vi
      .fn()
      .mockResolvedValue({
        flow_id: 'flow',
        authorization_url: 'https://auth.globus.org/authorize?state=bound',
      });
    const completeSourceSignIn = vi.fn().mockResolvedValue({ authenticated: true });
    const repository = { startSourceSignIn, completeSourceSignIn } as unknown as ClioRepository;
    await signInToStorage(
      repository,
      'workspace',
      'source',
      'globus',
      new AbortController().signal,
    );
    expect(startSourceSignIn).toHaveBeenCalledWith(
      'workspace',
      'source',
      'http://127.0.0.1:48173/clio-storage-return',
    );
    expect(completeSourceSignIn).toHaveBeenCalledWith(
      'workspace',
      'source',
      'flow',
      expect.stringContaining('code=private'),
    );
    expect(fixture.invoke).toHaveBeenLastCalledWith('storage_oauth_cancel', { id: 'receiver' });
  });
  it('does not complete after navigation aborts the initiating connection', async () => {
    const controller = new AbortController();
    fixture.invoke.mockImplementation((command: string) => {
      if (command === 'storage_oauth_listen')
        return Promise.resolve({
          id: 'r',
          redirect_uri: 'http://127.0.0.1:48173/clio-storage-return',
        });
      if (command === 'storage_oauth_receive') controller.abort();
      return Promise.resolve('private-return');
    });
    const completeSourceSignIn = vi.fn();
    const repository = {
      startSourceSignIn: vi
        .fn()
        .mockResolvedValue({
          flow_id: 'f',
          authorization_url: 'https://auth.globus.org/authorize?state=bound',
        }),
      completeSourceSignIn,
    } as unknown as ClioRepository;
    await expect(
      signInToStorage(repository, 'w', 's', 'globus', controller.signal),
    ).rejects.toThrow();
    expect(completeSourceSignIn).not.toHaveBeenCalled();
  });
});
