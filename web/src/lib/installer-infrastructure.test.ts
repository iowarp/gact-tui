import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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

vi.mock('sonner', () => ({
  toast: { dismiss: vi.fn(), success: mocks.success, warning: mocks.warning },
}));
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
  });

  it('keeps MAG and each selected ALCF server visible as independent choices', () => {
    applyInstallerProviderVisibility('amsc_mag,argonne_minerva,argonne_tara', 'beta71-install');
    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    for (const id of ['amsc_mag', 'argonne_minerva', 'argonne_tara'])
      expect(hidden).not.toContain(id);
    for (const id of ['argonne_sophia', 'argonne_metis', 'openai']) expect(hidden).toContain(id);
  });

  it.each([
    'argonne_sophia,argonne_metis',
    'argonne_sophia,argonne_metis,argonne_minerva,argonne_tara',
  ])('migrates the untouched old installer list after reading %s', async (providerIds) => {
    const legacyHidden = [
      'codex',
      'claude_code',
      'openai',
      'anthropic',
      'gemini',
      'vertex_ai',
      'lm_studio',
      'ollama',
      'llama_cpp',
      'vllm',
      'argonne_minerva',
      'argonne_tara',
      'azure_openai',
      'bedrock',
      'nvidia_nim',
      'openrouter',
    ];
    window.localStorage.setItem('clio.hidden-providers.v1', JSON.stringify(legacyHidden));
    window.localStorage.setItem('clio.installer-applied-revision.v1', 'old-install');
    mocks.read.mockResolvedValue({
      schema: 4,
      provider_ids: providerIds,
      installed_at: 'old-install',
    });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    expect(hidden).not.toContain('argonne_minerva');
    expect(hidden).not.toContain('argonne_tara');
    expect(hidden).toContain('openai');
    expect(window.localStorage.getItem('clio.installer-applied-revision.v1')).toBe('old-install');
    window.localStorage.setItem(
      'clio.hidden-providers.v1',
      JSON.stringify([...hidden, 'argonne_minerva']),
    );
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1')!)).toContain(
      'argonne_minerva',
    );
  });

  it('preserves manual visibility changes when an old installer inventory is ambiguous', async () => {
    window.localStorage.setItem(
      'clio.hidden-providers.v1',
      JSON.stringify(['argonne_minerva', 'mistral']),
    );
    window.localStorage.setItem('clio.installer-applied-revision.v1', 'old-install');
    mocks.read.mockResolvedValue({
      schema: 4,
      provider_ids: 'argonne_sophia,argonne_metis',
      installed_at: 'old-install',
    });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1')!)).toEqual([
      'argonne_minerva',
      'mistral',
    ]);
  });

  it('respects explicit choices from the complete schema5 provider inventory', async () => {
    mocks.read.mockResolvedValue({
      schema: 5,
      provider_ids: 'argonne_sophia',
      installed_at: 'new-install',
    });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1')!);
    expect(hidden).not.toContain('argonne_sophia');
    for (const id of ['amsc_mag', 'argonne_metis', 'argonne_minerva', 'argonne_tara'])
      expect(hidden).toContain(id);
  });

  it('makes installer-selected providers visible without activating one', async () => {
    mocks.read.mockResolvedValue({
      schema: 4,
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

  it('applies visibility once per installed_at revision through finishInstallerInfrastructure, then leaves later Settings changes alone', async () => {
    mocks.read.mockResolvedValue({
      schema: 4,
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: 'claude_code',
      installed_at: '20260923215032',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    expect(window.localStorage.getItem('clio.installer-applied-revision.v1')).toBe(
      '20260923215032',
    );
    expect(
      JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]'),
    ).not.toContain('claude_code');

    // Simulate a Settings/picker change the user made afterward.
    window.localStorage.setItem('clio.hidden-providers.v1', JSON.stringify(['claude_code']));

    // A second managed-backend connect with the SAME installed_at (the same
    // install) must not revert that change — this is the bug F fix.
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([
      'claude_code',
    ]);
  });

  it('does not reapply visibility once a revision has already been applied (Settings/picker changes persist)', () => {
    // This is the apply-once fix for bug F: visibility used to be rederived
    // (and clobber a manual Settings change) on every managed-backend
    // connect. Once a revision has been applied, later drift in the stored
    // hidden list is left alone until a NEW install stamps a new revision.
    window.localStorage.setItem('clio.installer-applied-revision.v1', 'install-1');
    window.localStorage.setItem(
      'clio.hidden-providers.v1',
      JSON.stringify(['argonne_metis', 'argonne_sophia', 'anthropic']),
    );
    const changed = vi.fn();
    window.addEventListener('clio:provider-visibility-changed', changed, { once: true });

    applyInstallerProviderVisibility('codex,openai,argonne_sophia,argonne_metis', 'install-1');

    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    expect(hidden.sort()).toEqual(['anthropic', 'argonne_metis', 'argonne_sophia']);
    expect(changed).not.toHaveBeenCalled();
  });

  it('re-applies visibility when the installer stamps a new install revision', () => {
    window.localStorage.setItem('clio.installer-applied-revision.v1', 'install-1');
    window.localStorage.setItem(
      'clio.hidden-providers.v1',
      JSON.stringify(['argonne_metis', 'argonne_sophia']),
    );
    const changed = vi.fn();
    window.addEventListener('clio:provider-visibility-changed', changed, { once: true });

    applyInstallerProviderVisibility('codex,openai,argonne_sophia,argonne_metis', 'install-2');

    expect(window.localStorage.getItem('clio.installer-applied-revision.v1')).toBe('install-2');
    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    expect(hidden).not.toEqual(expect.arrayContaining(['argonne_sophia', 'argonne_metis']));
    expect(changed).toHaveBeenCalledOnce();
  });

  it('leaves visibility untouched when no provider selection was resolved', () => {
    window.localStorage.setItem('clio.hidden-providers.v1', JSON.stringify(['argonne_sophia']));

    applyInstallerProviderVisibility(undefined, 'install-1');

    expect(window.localStorage.getItem('clio.installer-applied-revision.v1')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([
      'argonne_sophia',
    ]);
  });

  it('makes every known provider id visible, including claude_code and all four ALCF ids', () => {
    applyInstallerProviderVisibility(
      'codex,claude_code,openai,anthropic,gemini,vertex_ai,lm_studio,ollama,llama_cpp,vllm,' +
        'argonne_sophia,argonne_metis,argonne_minerva,argonne_tara,azure_openai,bedrock,nvidia_nim,openrouter,amsc_mag',
      'install-1',
    );

    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    expect(hidden).toEqual([]);
  });

  it('expands the legacy Argonne family into all four ALCF servers', async () => {
    mocks.read.mockResolvedValue({
      schema: 3,
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_families: 'argonne',
      installed_at: 'install-alcf',
    });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    const hidden = JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]');
    for (const id of ['argonne_sophia', 'argonne_metis', 'argonne_minerva', 'argonne_tara']) {
      expect(hidden).not.toContain(id);
    }
    expect(hidden).toContain('openai');
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
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: 'claude_code',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.installProviderSupport).toHaveBeenCalledWith('claude_code');
    expect(mocks.updateLanguageModelConfiguration).not.toHaveBeenCalled();
  });

  it('installs Claude Code support only once per installer revision', async () => {
    // installProviderSupport used to run on every managed-backend connect.
    // It must follow the same apply-once stamp as provider visibility.
    mocks.read.mockResolvedValue({
      schema: 4,
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: 'claude_code',
      installed_at: '20260923215032',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.installProviderSupport).toHaveBeenCalledTimes(1);
  });

  it('migrates away from the old codex,openai fallback marker once there is no installer preference', () => {
    // Users whose hidden list was produced by the deleted "codex,openai"
    // default (web client, or desktop with no installer file) must not keep
    // it forever now that "no preference" returns early: this is a one-time
    // cleanup keyed on the old v3 marker.
    window.localStorage.setItem('clio.installer-provider-ids.v3', 'codex,openai');
    window.localStorage.setItem(
      'clio.hidden-providers.v1',
      JSON.stringify(['anthropic', 'claude_code', 'argonne_sophia', 'argonne_metis']),
    );
    const changed = vi.fn();
    window.addEventListener('clio:provider-visibility-changed', changed, { once: true });

    applyInstallerProviderVisibility(undefined);

    expect(window.localStorage.getItem('clio.installer-provider-ids.v3')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([]);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('leaves an old marker alone when it does not match the codex,openai fallback shape', () => {
    // A genuine v3-era explicit selection (not the deleted fallback) must
    // not be treated as fallback residue and wiped.
    window.localStorage.setItem('clio.installer-provider-ids.v3', 'anthropic,codex,openai');
    window.localStorage.setItem('clio.hidden-providers.v1', JSON.stringify(['claude_code']));

    applyInstallerProviderVisibility(undefined);

    expect(window.localStorage.getItem('clio.installer-provider-ids.v3')).toBe(
      'anthropic,codex,openai',
    );
    expect(JSON.parse(window.localStorage.getItem('clio.hidden-providers.v1') ?? '[]')).toEqual([
      'claude_code',
    ]);
  });

  it('removes the old marker once a new installer revision is applied', () => {
    window.localStorage.setItem('clio.installer-provider-ids.v3', 'codex,openai');

    applyInstallerProviderVisibility('claude_code', 'install-1');

    expect(window.localStorage.getItem('clio.installer-provider-ids.v3')).toBeNull();
  });

  it('logs a distinct reason for an explicit empty selection vs a genuinely absent preference', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    mocks.read.mockResolvedValueOnce({
      schema: 4,
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: '',
    });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    expect(infoSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'installer_provider_selection_empty' }),
    );

    infoSpy.mockClear();
    mocks.read.mockResolvedValueOnce({
      schema: 4,
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });
    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });
    expect(infoSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: 'installer_options_absent' }),
    );

    infoSpy.mockRestore();
  });

  it('treats an empty provider selection as no installer preference (leaves everything visible)', async () => {
    // An empty provider_ids can only reach this file from a pre-fix
    // installer run or a genuinely unattended `/S` install — the NSIS Leave
    // validation now blocks a wizard-driven empty choice. Either way, nobody
    // was actually asked, so this is "no preference," not "hide everything."
    mocks.read.mockResolvedValue({
      schema: 4,
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
      provider_ids: '',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(window.localStorage.getItem('clio.hidden-providers.v1')).toBeNull();
    expect(window.localStorage.getItem('clio.installer-applied-revision.v1')).toBeNull();
  });

  it('never installs or registers a search service, even when an older installer asked for one', async () => {
    // Search is built into the agent now; an installer file from before that still
    // records its old web search choice, which is ignored.
    mocks.read.mockResolvedValue({
      schema: 4,
      web_search: 'deployed',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.managedServiceCatalog).not.toHaveBeenCalled();
    expect(mocks.runManagedServiceAction).not.toHaveBeenCalled();
    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

describe('installerRequestedLlamaCpp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports true when the installer recorded a llama.cpp request', async () => {
    mocks.read.mockResolvedValue({
      schema: 2,
      llama_cpp: 'requested',
      clio_kit: 'bundled',
    });
    await expect(installerRequestedLlamaCpp()).resolves.toBe(true);
  });

  it('reports false when llama.cpp was not requested', async () => {
    mocks.read.mockResolvedValue({
      schema: 2,
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });
    await expect(installerRequestedLlamaCpp()).resolves.toBe(false);
  });
});
