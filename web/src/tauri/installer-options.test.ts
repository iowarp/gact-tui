import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { completeInstallerWebSearch, readInstallerOptions } from './installer-options';

describe('desktop installer options', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    Object.assign(window, { __TAURI_INTERNALS__: {} });
  });

  it('reads the native infrastructure and provider selection (v4 schema)', async () => {
    mocks.invoke.mockResolvedValue({
      schema: 4,
      web_search: 'deployed',
      llama_cpp: 'requested',
      clio_kit: 'bundled',
      provider_ids: 'codex,openai,argonne_sophia',
      installed_at: '20260923215032',
    });
    await expect(readInstallerOptions()).resolves.toMatchObject({
      web_search: 'deployed',
      llama_cpp: 'requested',
      clio_kit: 'bundled',
      provider_ids: 'codex,openai,argonne_sophia',
      installed_at: '20260923215032',
    });
    expect(mocks.invoke).toHaveBeenCalledWith('read_installer_options');
  });

  it('passes through an absent provider preference (missing/unreadable installer file)', async () => {
    // The Rust side now returns provider_ids/installed_at as undefined
    // (serialized as null) instead of a synthesized default when there is
    // nothing recorded — the TS layer must not paper over that.
    mocks.invoke.mockResolvedValue({
      schema: 4,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: null,
      installed_at: null,
    });
    const options = await readInstallerOptions();
    expect(options.provider_ids).toBeFalsy();
    expect(options.installed_at).toBeFalsy();
  });

  it('marks successful registration complete', async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await completeInstallerWebSearch();
    expect(mocks.invoke).toHaveBeenCalledWith('complete_installer_web_search');
  });

  it('records no installer preference outside Tauri, without invoking anything', async () => {
    // The plain web client has no native installer at all — it must not
    // silently assume a desktop-installer default like "codex,openai".
    Object.assign(window, { __TAURI_INTERNALS__: undefined });
    const options = await readInstallerOptions();
    expect(options).toEqual({
      schema: 4,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });
    expect(options.provider_ids).toBeUndefined();
    expect(options.installed_at).toBeUndefined();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
