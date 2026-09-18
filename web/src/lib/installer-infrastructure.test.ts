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

import { finishInstallerInfrastructure } from './installer-infrastructure';

describe('finishInstallerInfrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers an installer-deployed Web Search service', async () => {
    mocks.read.mockResolvedValue({ version: 1, web_search: true, web_search_status: 'deployed' });
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
      version: 1,
      web_search: true,
      web_search_status: 'needs_attention',
    });

    await finishInstallerInfrastructure({ endpoint: 'http://127.0.0.1:17800' });

    expect(mocks.configure).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledWith('CLIO Search still needs setup', expect.any(Object));
  });
});
