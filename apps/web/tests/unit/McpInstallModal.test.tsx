import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@clio/core';
import { McpInstallModal } from '../../src/components/McpInstallModal.js';

afterEach(cleanup);

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}) {
  const installMcpServer = vi.fn().mockResolvedValue({ ok: true });
  const client = {
    installMcpServer,
    ...overrides,
  } as unknown as Client;
  return { client, installMcpServer };
}

describe('McpInstallModal', () => {
  it('installs a stdio MCP server, resets the form, and notifies the parent', async () => {
    const { client, installMcpServer } = makeClient();
    const onInstalled = vi.fn();
    render(() => (
      <McpInstallModal
        open={true}
        client={client}
        onInstalled={onInstalled}
        onClose={() => undefined}
      />
    ));

    fireEvent.input(screen.getByTestId('mcp-install-name'), {
      target: { value: 'github' },
    });
    fireEvent.input(screen.getByTestId('mcp-install-command'), {
      target: { value: '/usr/local/bin/mcp-github' },
    });
    fireEvent.input(screen.getByTestId('mcp-install-args'), {
      target: { value: '--token=$GITHUB_TOKEN' },
    });
    fireEvent.click(screen.getByTestId('mcp-install-submit'));

    await waitFor(() =>
      expect(installMcpServer).toHaveBeenCalledWith({
        name: 'github',
        transport: 'stdio',
        command: '/usr/local/bin/mcp-github',
        args: ['--token=$GITHUB_TOKEN'],
      }),
    );
    expect(onInstalled).toHaveBeenCalledOnce();
    expect((screen.getByTestId('mcp-install-name') as HTMLInputElement).value).toBe('');
  });

  it('surfaces backend install failures without notifying the parent', async () => {
    const failingInstall = vi.fn().mockRejectedValue(new Error('install failed'));
    const { client } = makeClient({ installMcpServer: failingInstall });
    const onInstalled = vi.fn();
    render(() => (
      <McpInstallModal
        open={true}
        client={client}
        onInstalled={onInstalled}
        onClose={() => undefined}
      />
    ));

    fireEvent.input(screen.getByTestId('mcp-install-name'), {
      target: { value: 'github' },
    });
    fireEvent.input(screen.getByTestId('mcp-install-command'), {
      target: { value: '/usr/local/bin/mcp-github' },
    });
    fireEvent.click(screen.getByTestId('mcp-install-submit'));

    await waitFor(() => expect(failingInstall).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId('mcp-install-error').textContent).toContain('install failed'),
    );
    expect(onInstalled).not.toHaveBeenCalled();
  });
});
