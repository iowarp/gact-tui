import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  configure: vi.fn(),
  infrastructureOperation: vi.fn(),
  installProviderSupport: vi.fn(),
  languageModelConfiguration: vi.fn(),
  managedServiceCatalog: vi.fn(),
  read: vi.fn(),
  runManagedServiceAction: vi.fn(),
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
    infrastructureOperation: mocks.infrastructureOperation,
    installProviderSupport: mocks.installProviderSupport,
    languageModelConfiguration: mocks.languageModelConfiguration,
    managedServiceCatalog: mocks.managedServiceCatalog,
    runManagedServiceAction: mocks.runManagedServiceAction,
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
    mocks.installProviderSupport.mockResolvedValue({
      provider_id: 'claude_code',
      installed: true,
      instructions: 'installed',
    });
    mocks.managedServiceCatalog.mockResolvedValue({
      services: [
        {
          id: 'web_search',
          state: 'running',
          variants: [{ id: 'docker', compatible: true }],
        },
      ],
    });
  });

  it('makes installer-selected providers visible without activating one', async () => {
    mocks.read.mockResolvedValue({
      schema: 4,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: 'codex,openai',
    });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.languageModelConfiguration).not.toHaveBeenCalled();
    expect(mocks.updateLanguageModelConfiguration).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).not.toEqual(
      expect.arrayContaining(['codex', 'openai']),
    );
    expect(mocks.configure).not.toHaveBeenCalled();
  });

  it('repairs a stale hidden-provider list even when the provider marker already matches', () => {
    window.localStorage.setItem(
      'clio.installer-provider-ids.v3',
      'argonne_metis,argonne_sophia,codex,openai',
    );
    window.localStorage.setItem(
      'clio.hidden-providers.v1',
      JSON.stringify(['argonne_metis', 'argonne_sophia', 'anthropic']),
    );
    const changed = vi.fn();
    window.addEventListener('clio:provider-visibility-changed', changed, { once: true });

    applyInstallerProviderVisibility('codex,openai,argonne_sophia,argonne_metis');

    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    expect(hidden).not.toEqual(expect.arrayContaining(['argonne_sophia', 'argonne_metis']));
    expect(changed).toHaveBeenCalledOnce();
  });

  it('keeps Anthropic API and Claude Code as independent visibility choices', () => {
    applyInstallerProviderVisibility('anthropic');

    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    expect(hidden).not.toContain('anthropic');
    expect(hidden).toContain('claude_code');
  });

  it('installs Claude Code support when the installer selected it', async () => {
    mocks.read.mockResolvedValue({
      schema: 4,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: 'claude_code',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.installProviderSupport).toHaveBeenCalledWith('claude_code');
    expect(mocks.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('honors an explicit choice to show no providers', async () => {
    mocks.read.mockResolvedValue({
      schema: 4,
      web_search: 'not_requested',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: '',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    expect(hidden).toEqual(expect.arrayContaining(['codex', 'openai', 'anthropic', 'claude_code']));
  });

  it('registers an installer-deployed Web Search service', async () => {
    mocks.read.mockResolvedValue({
      schema: 4,
      web_search: 'deployed',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: 'codex,openai,argonne_sophia,argonne_metis',
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
    expect(window.localStorage.getItem('clio.installer-provider-ids.v3')).toBe(
      'argonne_metis,argonne_sophia,codex,openai',
    );
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).not.toEqual(
      expect.arrayContaining(['argonne_sophia', 'argonne_metis']),
    );
  });

  it('waits for an installer-started Web Search service before asking the user to intervene', async () => {
    vi.useFakeTimers();
    mocks.read.mockResolvedValue({
      schema: 4,
      web_search: 'deployed',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: 'codex,openai',
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
    mocks.managedServiceCatalog.mockResolvedValue({
      services: [
        {
          id: 'web_search',
          state: 'not_installed',
          variants: [{ id: 'docker', compatible: false, reason: 'Docker is not available.' }],
        },
      ],
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
