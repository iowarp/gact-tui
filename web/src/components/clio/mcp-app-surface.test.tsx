import { TransportError } from '@clio/core/v3';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpAppSurface } from './mcp-app-surface';

const descriptor = {
  protocol_version: '2026-01-26',
  resource: {
    uri: 'ui://vigil/viewer',
    mime_type: 'text/html;profile=mcp-app',
    html: '<main>private app html</main>',
    csp: {},
    permissions: {},
  },
  tool_input: { privateInput: 'never-rendered' },
  tool_result: { structuredContent: { privateResult: 'never-rendered' } },
  sandbox_url:
    'http://localhost:8788/v1/sessions/sess_1/mcp-apps/app_1/sandbox?data_ref=opaque-ref',
};

function repository() {
  return {
    mcpAppDescriptor: vi.fn(async (identity: typeof propsIdentity) => ({
      ...descriptor,
      sandbox_url: `http://localhost:8788/v1/sessions/${encodeURIComponent(identity.sessionId)}/mcp-apps/${encodeURIComponent(identity.appInstanceId)}/sandbox?data_ref=${encodeURIComponent(identity.dataRef)}`,
    })),
    callMcpAppTool: vi.fn(async () => ({ content: [] })),
    readMcpAppResource: vi.fn(async () => ({ contents: [] })),
    updateMcpAppModelContext: vi.fn(async () => ({})),
    postMcpAppMessage: vi.fn(async () => ({
      message_id: 'msg_1',
      delivery: 'queued',
      state: 'waiting',
    })),
    closeMcpApp: vi.fn(async () => undefined),
  };
}

const propsIdentity = {
  sessionId: 'sess_1',
  appInstanceId: 'app_1',
  dataRef: 'opaque-ref',
};

const props = {
  appInstanceId: 'app_1',
  dataRef: 'opaque-ref',
  resourceUri: 'ui://vigil/viewer',
  sessionId: 'sess_1',
  sourceServer: 'VIGIL',
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('McpAppSurface', () => {
  it('handshakes through the distinct-origin sandbox and keeps private data out of markup', async () => {
    const client = repository();
    const { container } = render(<McpAppSurface {...props} repository={client} />);
    const iframe = await screen.findByTitle<HTMLIFrameElement>('VIGIL interactive view');
    expect(iframe).toHaveAttribute('referrerpolicy', 'origin');
    const target = iframe.contentWindow;
    expect(target).not.toBeNull();
    const post = vi.spyOn(target!, 'postMessage');

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          jsonrpc: '2.0',
          method: 'ui/notifications/sandbox-proxy-ready',
          params: {},
        },
        origin: 'http://localhost:8788',
        source: target,
      }),
    );
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'ui/notifications/sandbox-resource-ready',
        params: expect.objectContaining({
          html: descriptor.resource.html,
          csp: descriptor.resource.csp,
          permissions: descriptor.resource.permissions,
        }),
      }),
      'http://localhost:8788',
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          jsonrpc: '2.0',
          id: 'initialize-1',
          method: 'ui/initialize',
          params: {
            protocolVersion: '2026-01-26',
            appInfo: { name: 'VIGIL view', version: '1.0.0' },
            appCapabilities: { availableDisplayModes: ['inline'] },
          },
        },
        origin: 'http://localhost:8788',
        source: target,
      }),
    );
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'initialize-1',
        result: expect.objectContaining({ protocolVersion: '2026-01-26' }),
      }),
      'http://localhost:8788',
    );
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            jsonrpc: '2.0',
            method: 'ui/notifications/initialized',
            params: {},
          },
          origin: 'http://localhost:8788',
          source: target,
        }),
      );
    });
    expect(await screen.findByText('Ready')).toBeVisible();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'ui/notifications/tool-input',
        params: { arguments: descriptor.tool_input },
      }),
      'http://localhost:8788',
    );
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'ui/notifications/tool-result' }),
      'http://localhost:8788',
    );
    expect(container).not.toHaveTextContent('never-rendered');
    expect(container).not.toHaveTextContent('private app html');
  });

  it('bridges requests to the exact app and closes it once on teardown', async () => {
    const client = repository();
    const view = render(<McpAppSurface {...props} appInstanceId="app_2" repository={client} />);
    const iframe = await screen.findByTitle<HTMLIFrameElement>('VIGIL interactive view');
    const target = iframe.contentWindow;

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'select', arguments: { row: 2 } },
        },
        origin: 'http://localhost:8788',
        source: target,
      }),
    );
    await waitFor(() =>
      expect(client.callMcpAppTool).toHaveBeenCalledWith(
        { sessionId: 'sess_1', appInstanceId: 'app_2', dataRef: 'opaque-ref' },
        { name: 'select', arguments: { row: 2 } },
      ),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          jsonrpc: '2.0',
          id: 8,
          method: 'ui/message',
          params: {
            role: 'user',
            content: [{ type: 'text', text: 'Inspect row 2' }],
          },
        },
        origin: 'http://localhost:8788',
        source: target,
      }),
    );
    await waitFor(() =>
      expect(client.postMcpAppMessage).toHaveBeenCalledWith(
        { sessionId: 'sess_1', appInstanceId: 'app_2', dataRef: 'opaque-ref' },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Inspect row 2' }],
        },
      ),
    );

    view.unmount();
    await waitFor(() => expect(client.closeMcpApp).toHaveBeenCalledTimes(1));
  });

  it('contains a same-origin sandbox error instead of mounting it', async () => {
    const client = repository();
    client.mcpAppDescriptor.mockResolvedValue({
      ...descriptor,
      sandbox_url: `${window.location.origin}/sandbox`,
    });
    render(<McpAppSurface {...props} appInstanceId="app_3" repository={client} />);

    expect(await screen.findByText('Interactive tool unavailable')).toBeVisible();
    expect(screen.queryByTitle('VIGIL interactive view')).not.toBeInTheDocument();
  });

  it('recovers from one transient descriptor connection failure', async () => {
    const client = repository();
    client.mcpAppDescriptor.mockRejectedValueOnce(
      new TransportError(
        'Unable to reach the service at http://localhost:8788',
        undefined,
        'network_unavailable',
      ),
    );

    render(<McpAppSurface {...props} appInstanceId="app_retry" repository={client} />);

    expect(await screen.findByTitle('VIGIL interactive view')).toBeVisible();
    expect(client.mcpAppDescriptor).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Interactive tool unavailable')).not.toBeInTheDocument();
  });

  it('removes the replaced iframe and closes only the replaced app', async () => {
    const client = repository();
    const view = render(<McpAppSurface {...props} appInstanceId="app_4" repository={client} />);
    const first = await screen.findByTitle<HTMLIFrameElement>('VIGIL interactive view');
    expect(first).toHaveAttribute('data-mcp-app-iframe', 'app_4');

    view.rerender(
      <McpAppSurface
        {...props}
        appInstanceId="app_5"
        repository={client}
        sourceServer="Simulation viewer"
      />,
    );

    const second = await screen.findByTitle<HTMLIFrameElement>(
      'Simulation viewer interactive view',
    );
    expect(second).toHaveAttribute('data-mcp-app-iframe', 'app_5');
    expect(document.querySelector('[data-mcp-app-iframe="app_4"]')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(client.closeMcpApp).toHaveBeenCalledWith({
        sessionId: 'sess_1',
        appInstanceId: 'app_4',
        dataRef: 'opaque-ref',
      }),
    );
    expect(client.closeMcpApp).not.toHaveBeenCalledWith(
      expect.objectContaining({ appInstanceId: 'app_5' }),
    );
  });
});
