import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  configure: vi.fn(),
  read: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: mocks.success, warning: mocks.warning } }));
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  createRepository: () => ({ configureMcpServer: mocks.configure }),
}));
vi.mock('@/tauri/installer-options', () => ({
  completeInstallerWebSearch: mocks.complete,
  readInstallerOptions: mocks.read,
}));

import { finishInstallerInfrastructure, installerRequestedLlamaCpp } from './installer-infrastructure';

describe('finishInstallerInfrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers an installer-deployed Web Search service', async () => {
    mocks.read.mockResolvedValue({
      schema: 2,
      web_search: 'deployed',
      llama_cpp: 'not_requested',
      clio_kit: 'bundled',
    });
    mocks.configure.mockResolvedValue({ status: 'ready' });

    await finishInstallerInfrastructure({
      endpoint: 'http://127.0.0.1:17800',
      token: 'managed-token',
    });

    expect(mocks.configure).toHaveBeenCalledWith('web', {
      name: 'CLIO Web Search',
      transport: 'stdio',
      command: 'uvx',
      args: [
        '--from',
        'clio-kit==2.10.5',
        'clio-kit',
        'mcp-server',
        'web',
        '--remote-url',
        'http://127.0.0.1:8089',
      ],
    });
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledWith('CLIO Search is ready', expect.any(Object));
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
