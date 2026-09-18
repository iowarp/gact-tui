import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { completeInstallerWebSearch, readInstallerOptions } from './installer-options';

describe('desktop installer options', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    Object.assign(window, { __TAURI_INTERNALS__: {} });
  });

  it('reads the native infrastructure selection', async () => {
    mocks.invoke.mockResolvedValue({ version: 1, web_search: true, web_search_status: 'deployed' });
    await expect(readInstallerOptions()).resolves.toMatchObject({
      web_search: true,
      web_search_status: 'deployed',
    });
    expect(mocks.invoke).toHaveBeenCalledWith('read_installer_options');
  });

  it('marks successful registration complete', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await completeInstallerWebSearch();
    expect(mocks.invoke).toHaveBeenCalledWith('complete_installer_web_search');
  });
});
