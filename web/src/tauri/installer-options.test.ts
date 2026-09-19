import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { completeInstallerWebSearch, readInstallerOptions } from './installer-options';

describe('desktop installer options', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    Object.assign(window, { __TAURI_INTERNALS__: {} });
  });

  it('reads the native infrastructure selection (v2 schema)', async () => {
    mocks.invoke.mockResolvedValue({
      schema: 2,
      web_search: 'deployed',
      llama_cpp: 'requested',
      clio_kit: 'bundled',
    });
    await expect(readInstallerOptions()).resolves.toMatchObject({
      web_search: 'deployed',
      llama_cpp: 'requested',
      clio_kit: 'bundled',
    });
    expect(mocks.invoke).toHaveBeenCalledWith('read_installer_options');
  });

  it('marks successful registration complete', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await completeInstallerWebSearch();
    expect(mocks.invoke).toHaveBeenCalledWith('complete_installer_web_search');
  });

  it('defaults to not_requested outside Tauri, without invoking anything', async () => {
    Object.assign(window, { __TAURI_INTERNALS__: undefined });
    await expect(readInstallerOptions()).resolves.toEqual({
      schema: 2,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
