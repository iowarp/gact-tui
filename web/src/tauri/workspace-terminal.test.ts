import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));

import { openWorkspaceTerminal } from './workspace-terminal';

describe('openWorkspaceTerminal', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    Object.assign(window, { __TAURI_INTERNALS__: {} });
  });

  it('asks the native shell to open the exact workspace path', async () => {
    mocks.invoke.mockResolvedValue('C:\\science\\palm-springs');

    await expect(openWorkspaceTerminal('C:\\science\\palm-springs')).resolves.toBe(
      'C:\\science\\palm-springs',
    );
    expect(mocks.invoke).toHaveBeenCalledWith('open_workspace_terminal', {
      path: 'C:\\science\\palm-springs',
    });
  });
});
