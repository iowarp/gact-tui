/**
 * 1.0 item E3 — MCP server "Reconnect" button, restored with graceful
 * degradation.
 *
 * clio advertises no capability flag for the reconnect route
 * (POST /v1/mcp/servers/{id}/reconnect), so the button discovers support
 * empirically:
 *   - success → success toast + the server list refetches
 *   - 404     → the route is absent on this backend; the button disables
 *               across every card and a single info toast explains it
 *   - 500/net → transient; error toast, button stays enabled (retryable)
 *
 * These tests mock the @clio/core Client as a partial fake (only the
 * methods McpPage touches) and drive the rendered cards.
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Client, McpServerInfo } from '@clio/core';
import { McpPage } from '../../src/routes/discovery/McpPage.js';
import { ToastProvider } from '../../src/components/Toast.js';

afterEach(cleanup);

const SERVERS: McpServerInfo[] = [
  {
    id: 'fs',
    name: 'Filesystem',
    status: 'disconnected',
    transport: 'stdio',
    tools_count: 0,
    tools: [],
  },
  {
    id: 'gh',
    name: 'GitHub',
    status: 'ready',
    transport: 'http',
    tools_count: 3,
    tools: ['search', 'issues', 'prs'],
  },
];

/** Builds an HttpError-shaped rejection: the real @clio/core HttpError
 *  carries a numeric `.status`, which is what McpPage duck-types on. */
function httpError(status: number, message = `HTTP ${status}`): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

/** Partial Client mock — only the methods McpPage invokes. The unused
 *  surface is filled with rejecting stubs so an accidental call is loud. */
function makeClient(
  overrides: Partial<Record<keyof Client, unknown>> = {},
): { client: Client; mcpServers: ReturnType<typeof vi.fn>; reconnectMcpServer: ReturnType<typeof vi.fn> } {
  const mcpServers = vi.fn().mockResolvedValue({ servers: SERVERS });
  const reconnectMcpServer = vi.fn().mockResolvedValue({ status: 'ready' });
  const client = {
    mcpServers,
    reconnectMcpServer,
    // McpServerCard only fetches detail when expanded; not exercised here.
    ...overrides,
  } as unknown as Client;
  return { client, mcpServers, reconnectMcpServer };
}

function mount(client: Client) {
  return render(() => (
    <ToastProvider>
      <McpPage client={client} />
    </ToastProvider>
  ));
}

/** Flush the createResource microtasks so the server list renders. */
async function settled() {
  await waitFor(() => expect(screen.queryByTestId('mcp-reconnect-fs')).toBeTruthy());
}

describe('MCP Reconnect button', () => {
  it('renders a Reconnect button on every server card', async () => {
    const { client } = makeClient();
    mount(client);
    await settled();
    expect(screen.getByTestId('mcp-reconnect-fs')).toBeTruthy();
    expect(screen.getByTestId('mcp-reconnect-gh')).toBeTruthy();
  });

  it('success path → calls reconnectMcpServer, toasts, and refetches the list', async () => {
    const { client, mcpServers, reconnectMcpServer } = makeClient();
    mount(client);
    await settled();
    // Initial list load = one mcpServers() call.
    expect(mcpServers).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('mcp-reconnect-fs'));

    await waitFor(() =>
      expect(reconnectMcpServer).toHaveBeenCalledWith('fs'),
    );
    // Success toast naming the server.
    await waitFor(() => expect(screen.getByText('Reconnected Filesystem')).toBeTruthy());
    // Refetch fired → mcpServers called a second time.
    await waitFor(() => expect(mcpServers).toHaveBeenCalledTimes(2));
  });

  it('404 → marks reconnect unsupported: every button disables + one info toast', async () => {
    const reconnectMcpServer = vi.fn().mockRejectedValue(httpError(404));
    const { client } = makeClient({ reconnectMcpServer });
    mount(client);
    await settled();

    const fsBtn = screen.getByTestId('mcp-reconnect-fs') as HTMLButtonElement;
    const ghBtn = screen.getByTestId('mcp-reconnect-gh') as HTMLButtonElement;
    expect(fsBtn.disabled).toBe(false);

    fireEvent.click(fsBtn);
    await waitFor(() => expect(reconnectMcpServer).toHaveBeenCalledTimes(1));

    // Both cards' buttons disable (page-level latch) with the honest tooltip.
    await waitFor(() => expect(fsBtn.disabled).toBe(true));
    expect(ghBtn.disabled).toBe(true);
    expect(fsBtn.title).toMatch(/Not supported by this backend/i);

    // A single explanatory info toast appeared.
    await waitFor(() => expect(screen.getByText('Reconnect not available')).toBeTruthy());

    // Further clicks on the (disabled) button do not re-fire the request.
    fireEvent.click(fsBtn);
    fireEvent.click(ghBtn);
    expect(reconnectMcpServer).toHaveBeenCalledTimes(1);
  });

  it('500 → error toast, button stays enabled (retryable)', async () => {
    const reconnectMcpServer = vi.fn().mockRejectedValue(httpError(500, 'boom'));
    const { client } = makeClient({ reconnectMcpServer });
    mount(client);
    await settled();

    const fsBtn = screen.getByTestId('mcp-reconnect-fs') as HTMLButtonElement;
    fireEvent.click(fsBtn);

    await waitFor(() => expect(screen.getByText('Reconnect failed')).toBeTruthy());
    // Not a 404 → button remains enabled so the user can retry.
    expect(fsBtn.disabled).toBe(false);
    expect(fsBtn.title).toBe('');
  });
});
