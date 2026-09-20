import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  configure: vi.fn(),
  languageModelConfiguration: vi.fn(),
  read: vi.fn(),
  success: vi.fn(),
  updateLanguageModelConfiguration: vi.fn(),
  waitLanguageModelConfiguration: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: mocks.success, warning: mocks.warning } }));
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  createRepository: () => ({
    configureMcpServer: mocks.configure,
    languageModelConfiguration: mocks.languageModelConfiguration,
    updateLanguageModelConfiguration: mocks.updateLanguageModelConfiguration,
    waitLanguageModelConfiguration: mocks.waitLanguageModelConfiguration,
  }),
}));
vi.mock('@/tauri/installer-options', () => ({
  completeInstallerWebSearch: mocks.complete,
  readInstallerOptions: mocks.read,
}));

import {
  applyInstallerProviderVisibility,
  finishInstallerInfrastructure,
  installerRequestedLlamaCpp,
} from './installer-infrastructure';

describe('finishInstallerInfrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.languageModelConfiguration.mockResolvedValue({ configured: true, presets: [] });
  });

  it('starts an authenticated provider selected by the installer', async () => {
    mocks.read.mockResolvedValue({
      schema: 3,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_families: 'openai',
    });
    mocks.languageModelConfiguration.mockResolvedValue({
      configured: false,
      presets: [
        {
          id: 'codex',
          provider_id: 'codex',
          provider: 'codex',
          api_base: 'codex://sdk',
          suggested_model: 'gpt-5.5',
          is_authenticated: true,
          requires_api_key: false,
          configuration_fields: [],
        },
      ],
    });
    mocks.updateLanguageModelConfiguration.mockResolvedValue({
      configured: true,
      state: 'ready',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.updateLanguageModelConfiguration).toHaveBeenCalledWith({
      api_base: 'codex://sdk',
      model: 'gpt-5.5',
      provider: 'codex',
      provider_id: 'codex',
      provider_options: {},
    });
    expect(mocks.configure).not.toHaveBeenCalled();
  });

  it('guides the user when an installer-selected provider still needs sign-in', async () => {
    mocks.read.mockResolvedValue({
      schema: 3,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_families: 'argonne',
    });
    mocks.languageModelConfiguration.mockResolvedValue({
      configured: false,
      presets: [
        {
          id: 'argonne_metis',
          provider_id: 'argonne_metis',
          provider: 'argonne',
          suggested_model: 'gpt-oss-120b',
          is_authenticated: false,
          requires_api_key: false,
          configuration_fields: [],
        },
      ],
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.updateLanguageModelConfiguration).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledWith(
      'Your selected model provider needs sign-in',
      expect.any(Object),
    );
  });

  it('repairs a stale hidden-provider list even when the family marker already matches', () => {
    window.localStorage.setItem('clio.installer-provider-families.v2', 'argonne,openai');
    window.localStorage.setItem(
      'clio.hidden-providers.v1',
      JSON.stringify(['argonne_metis', 'argonne_sophia', 'anthropic']),
    );
    const changed = vi.fn();
    window.addEventListener('clio:provider-visibility-changed', changed, { once: true });

    applyInstallerProviderVisibility('openai,argonne');

    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    expect(hidden).not.toEqual(expect.arrayContaining(['argonne_sophia', 'argonne_metis']));
    expect(changed).toHaveBeenCalledOnce();
  });

  it('registers an installer-deployed Web Search service', async () => {
    mocks.read.mockResolvedValue({
      schema: 3,
      web_search: 'deployed',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_families: 'openai,argonne',
    });
    mocks.configure.mockResolvedValue({ status: 'ready' });

    await finishInstallerInfrastructure({
      endpoint: 'http://127.0.0.1:17800',
      token: 'managed-token',
    });

    expect(mocks.configure).toHaveBeenCalledWith('web', {
      name: 'CLIO Web Search',
      transport: 'stdio',
      command: 'clio-kit',
      args: ['mcp-server', 'web', '--remote-url', 'http://127.0.0.1:8089'],
      env: { WEB_STATE_DIR: '.clio-child-cache/web-mcp-state' },
      always_load: true,
    });
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledWith('CLIO Search is ready', expect.any(Object));
    expect(window.localStorage.getItem('clio.installer-provider-families.v2')).toBe(
      'argonne,openai',
    );
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).not.toEqual(
      expect.arrayContaining(['argonne_sophia', 'argonne_metis']),
    );
  });

  it('waits for an installer-started Web Search service before asking the user to intervene', async () => {
    vi.useFakeTimers();
    mocks.read.mockResolvedValue({
      schema: 3,
      web_search: 'deployed',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_families: 'openai',
    });
    mocks.configure
      .mockResolvedValueOnce({ status: 'degraded', error: 'service is still starting' })
      .mockResolvedValueOnce({ status: 'ready' });

    const completion = finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    await vi.advanceTimersByTimeAsync(2_000);
    await completion;

    expect(mocks.configure).toHaveBeenCalledTimes(2);
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('leaves a recoverable notice when Docker was unavailable during installation', async () => {
    mocks.read.mockResolvedValue({
      schema: 2,
      web_search: 'needs_attention',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledWith('CLIO Search still needs setup', expect.any(Object));
  });

  it('does nothing when Web Search was never requested', async () => {
    mocks.read.mockResolvedValue({
      schema: 2,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does nothing once Web Search is already configured', async () => {
    mocks.read.mockResolvedValue({
      schema: 2,
      web_search: 'configured',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.warning).not.toHaveBeenCalled();
  });
});

describe('installerRequestedLlamaCpp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports true when the installer recorded a llama.cpp request', async () => {
    mocks.read.mockResolvedValue({
      schema: 2,
      web_search: 'not_requested',
      llama_cpp: 'requested',
      clio_kit: 'bundled',
    });
    await expect(installerRequestedLlamaCpp()).resolves.toBe(true);
  });

  it('reports false when llama.cpp was not requested', async () => {
    mocks.read.mockResolvedValue({
      schema: 2,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });
    await expect(installerRequestedLlamaCpp()).resolves.toBe(false);
  });
});
