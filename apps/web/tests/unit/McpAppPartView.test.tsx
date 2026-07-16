import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import type {
  Client,
  McpAppPayload,
  McpAppRef,
  McpCallToolResult,
  McpReadResourceResult,
  Message,
} from '@clio/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockBridge {
  constructorArgs: unknown[];
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  teardownResource: ReturnType<typeof vi.fn>;
  sendSandboxResourceReady: ReturnType<typeof vi.fn>;
  sendToolInput: ReturnType<typeof vi.fn>;
  sendToolResult: ReturnType<typeof vi.fn>;
  oncalltool?: (params: {
    name: string;
    arguments?: Record<string, unknown>;
  }) => Promise<unknown>;
  onreadresource?: (params: { uri: string }) => Promise<unknown>;
  onmessage?: (params: Record<string, unknown>) => Promise<unknown>;
  onupdatemodelcontext?: (params: Record<string, unknown>) => Promise<unknown>;
  onloggingmessage?: (params: Record<string, unknown>) => unknown;
  onsizechange?: (params: { height?: number }) => unknown;
  onsandboxready?: () => unknown;
  oninitialized?: () => unknown;
}

const bridgeState = vi.hoisted(() => ({ instances: [] as MockBridge[] }));

vi.mock('@modelcontextprotocol/ext-apps/app-bridge', () => {
  class AppBridge implements MockBridge {
    constructorArgs: unknown[];
    connect = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
    teardownResource = vi.fn(async () => undefined);
    sendSandboxResourceReady = vi.fn(async () => undefined);
    sendToolInput = vi.fn(async () => undefined);
    sendToolResult = vi.fn(async () => undefined);
    oncalltool?: MockBridge['oncalltool'];
    onreadresource?: MockBridge['onreadresource'];
    onmessage?: MockBridge['onmessage'];
    onupdatemodelcontext?: MockBridge['onupdatemodelcontext'];
    onloggingmessage?: MockBridge['onloggingmessage'];
    onsizechange?: MockBridge['onsizechange'];
    onsandboxready?: MockBridge['onsandboxready'];
    oninitialized?: MockBridge['oninitialized'];

    constructor(...args: unknown[]) {
      this.constructorArgs = args;
      bridgeState.instances.push(this);
    }
  }

  class PostMessageTransport {
    constructor(
      readonly targetWindow: Window,
      readonly sourceWindow: Window,
    ) {}
  }

  return {
    AppBridge,
    PostMessageTransport,
    RESOURCE_MIME_TYPE: 'text/html;profile=mcp-app',
    buildAllowAttribute: () => 'clipboard-write',
  };
});

const { Transcript } = await import('../../src/components/Transcript.js');

const appRef: McpAppRef = {
  sessionId: 'session-42',
  appInstanceId: 'app-capability-7',
  dataRef: 'private-result-9',
};

const privateToolResult: McpCallToolResult = {
  content: [{ type: 'text', text: 'Viewer opened' }],
  structuredContent: {
    schema_version: 'vigil.visualization-session.v1',
    session: { session_id: 'viewer-3' },
  },
  _meta: {
    'io.iowarp.vigil': {
      admission: { bearer_token: 'NEVER_RENDER_THIS_PRIVATE_TOKEN' },
      cleanup: { tool: 'close_viewer_session', arguments: { session_id: 'viewer-3' } },
    },
  },
};

const payload: McpAppPayload = {
  protocol_version: '2026-01-26',
  resource: {
    uri: 'ui://vigil/viewer',
    mime_type: 'text/html;profile=mcp-app',
    html: '<!doctype html><main>VIGIL</main>',
    csp: { connectDomains: ['http://127.0.0.1:*'] },
    permissions: { clipboardWrite: {} },
  },
  tool_input: { dataset_id: 'asteroid2018', timestep: 12 },
  tool_result: privateToolResult,
  sandbox_url: 'http://localhost:17800/v1/sessions/session-42/mcp-apps/app-capability-7/sandbox?data_ref=private-result-9',
};

function makeClient() {
  const toolResult: McpCallToolResult = {
    content: [{ type: 'text', text: 'timestep changed' }],
    structuredContent: { timestep: 13 },
  };
  const resourceResult: McpReadResourceResult = {
    contents: [{ uri: 'vigil://datasets/asteroid2018', text: 'dataset metadata' }],
  };
  return {
    baseUrl: 'http://127.0.0.1:17800',
    mcpApp: vi.fn(async (_ref: McpAppRef): Promise<McpAppPayload> => payload),
    callMcpAppTool: vi.fn(
      async (
        _ref: McpAppRef,
        _body: { name: string; arguments?: Record<string, unknown> },
      ): Promise<McpCallToolResult> => toolResult,
    ),
    readMcpAppResource: vi.fn(
      async (_ref: McpAppRef, _uri: string): Promise<McpReadResourceResult> => resourceResult,
    ),
    postMcpAppMessage: vi.fn(
      async (_ref: McpAppRef, _message: Record<string, unknown>) => ({ message_id: 'm-next' }),
    ),
    updateMcpAppModelContext: vi.fn(
      async (_ref: McpAppRef, _context: Record<string, unknown>) => ({}),
    ),
    closeMcpApp: vi.fn(async (_ref: McpAppRef): Promise<void> => undefined),
    toolResult,
    resourceResult,
  };
}

function appMessage(): Message {
  return {
    id: 'assistant-app-message',
    role: 'assistant',
    parts: [
      {
        type: 'mcp_app',
        app_instance_id: appRef.appInstanceId,
        resource_uri: payload.resource.uri,
        source_server: 'ares-vigil',
        data_ref: appRef.dataRef,
        mime_type: 'text/html;profile=mcp-app',
        height: 540,
      },
    ],
  };
}

afterEach(cleanup);

beforeEach(() => {
  bridgeState.instances.length = 0;
  vi.clearAllMocks();
});

describe('MCP App transcript rendering', () => {
  it('passes a typed mcp_app part through the real transcript path with its exact binding', async () => {
    const client = makeClient();

    render(() => (
      <Transcript
        density="normal"
        messages={[appMessage()]}
        mcpAppClient={client as unknown as Client}
        sessionId={appRef.sessionId}
      />
    ));

    await waitFor(() => expect(client.mcpApp).toHaveBeenCalledWith(appRef));
    expect(screen.queryByTestId('trx-unknown-part')).toBeNull();
    expect(screen.getByTestId('mcp-app-part').getAttribute('data-source')).toBe('ares-vigil');
    expect(screen.getByTestId('mcp-app-part').textContent).toContain(
      'Interactive view - ares-vigil',
    );
    expect(screen.getByTestId('mcp-app-close').textContent).toBe('Close');
    expect(screen.getByTestId('mcp-app-iframe').getAttribute('style')).toContain('540px');

    await waitFor(() => expect(bridgeState.instances).toHaveLength(1));
    const bridge = bridgeState.instances[0]!;
    expect(bridge.connect).toHaveBeenCalledOnce();
    expect(bridge.constructorArgs[0]).toBeNull();
    expect(bridge.constructorArgs[2]).toMatchObject({
      serverTools: {},
      serverResources: {},
      message: { text: {} },
      updateModelContext: { text: {} },
      sandbox: { csp: payload.resource.csp, permissions: payload.resource.permissions },
    });
    const frame = screen.getByTestId('mcp-app-iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('allow')).toBe('clipboard-write');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms');
    expect(new URL(frame.src).origin).toBe('http://localhost:17800');
    expect(new URL(frame.src).origin).not.toBe(window.location.origin);
  });

  it('delivers the full private result only through the bound bridge and routes app requests exactly', async () => {
    const client = makeClient();
    const { unmount } = render(() => (
      <Transcript
        density="normal"
        messages={[appMessage()]}
        mcpAppClient={client as unknown as Client}
        sessionId={appRef.sessionId}
      />
    ));

    await waitFor(() => expect(bridgeState.instances).toHaveLength(1));
    const bridge = bridgeState.instances[0]!;

    bridge.onsandboxready?.();
    expect(bridge.sendSandboxResourceReady).toHaveBeenCalledWith({
      html: payload.resource.html,
      csp: payload.resource.csp,
      permissions: payload.resource.permissions,
    });

    bridge.oninitialized?.();
    expect(bridge.sendToolInput).toHaveBeenCalledWith({ arguments: payload.tool_input });
    expect(bridge.sendToolResult).toHaveBeenCalledWith(privateToolResult);
    expect(document.body.textContent).not.toContain('NEVER_RENDER_THIS_PRIVATE_TOKEN');

    await expect(
      bridge.oncalltool?.({ name: 'set_timestep', arguments: { timestep: 13 } }),
    ).resolves.toEqual(client.toolResult);
    expect(client.callMcpAppTool).toHaveBeenCalledWith(appRef, {
      name: 'set_timestep',
      arguments: { timestep: 13 },
    });

    await expect(
      bridge.onreadresource?.({ uri: 'vigil://datasets/asteroid2018' }),
    ).resolves.toEqual(client.resourceResult);
    expect(client.readMcpAppResource).toHaveBeenCalledWith(
      appRef,
      'vigil://datasets/asteroid2018',
    );

    await expect(
      bridge.onupdatemodelcontext?.({ content: [{ type: 'text', text: 'selected timestep 13' }] }),
    ).resolves.toEqual({});
    expect(client.updateMcpAppModelContext).toHaveBeenCalledWith(appRef, {
      content: [{ type: 'text', text: 'selected timestep 13' }],
    });

    await expect(
      bridge.onmessage?.({ role: 'user', content: [{ type: 'text', text: 'Explain this view' }] }),
    ).resolves.toEqual({});
    expect(client.postMcpAppMessage).toHaveBeenCalledWith(appRef, {
      role: 'user',
      content: [{ type: 'text', text: 'Explain this view' }],
    });

    bridge.onsizechange?.({ height: 5_000 });
    expect(screen.getByTestId('mcp-app-iframe').getAttribute('style')).toContain('1200px');

    fireEvent.click(screen.getByTestId('mcp-app-close'));
    await waitFor(() => expect(client.closeMcpApp).toHaveBeenCalledWith(appRef));
    expect(bridge.teardownResource).toHaveBeenCalledOnce();
    expect(bridge.close).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('mcp-app-iframe')).toBeNull();

    unmount();
  });

  it('keeps the forward-compatible unknown renderer when the capability client is absent', () => {
    render(() => <Transcript density="normal" messages={[appMessage()]} sessionId={appRef.sessionId} />);

    expect(screen.getByTestId('trx-unknown-part').textContent).toContain('mcp_app');
    expect(screen.queryByTestId('mcp-app-part')).toBeNull();
  });
});
