import type {
  Client,
  McpAppPayload,
  McpAppRef,
  PartMcpApp,
} from '@clio/core';
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import {
  AppBridge,
  PostMessageTransport,
  RESOURCE_MIME_TYPE,
  buildAllowAttribute,
  type McpUiResourceCsp,
  type McpUiResourcePermissions,
} from '@modelcontextprotocol/ext-apps/app-bridge';
import { Show, createEffect, createResource, createSignal, onCleanup } from 'solid-js';
import './mcp-app.css';

export interface McpAppPartViewProps {
  part: PartMcpApp;
  sessionId: string;
  client: Client;
}

function appRef(props: McpAppPartViewProps): McpAppRef {
  return {
    sessionId: props.sessionId,
    appInstanceId: props.part.app_instance_id,
    dataRef: props.part.data_ref,
  };
}

function platform(): 'web' | 'desktop' {
  return '__TAURI_INTERNALS__' in window ? 'desktop' : 'web';
}

/** Render one MCP Apps 2026-01-26 capability reference in an isolated iframe. */
export function McpAppPartView(props: McpAppPartViewProps) {
  const ref = () => appRef(props);
  const [payload] = createResource(
    () => `${props.sessionId}:${props.part.app_instance_id}:${props.part.data_ref}`,
    () => props.client.mcpApp(ref()),
  );
  const [runtimeError, setRuntimeError] = createSignal('');
  const [height, setHeight] = createSignal(props.part.height || 680);
  const [closed, setClosed] = createSignal(false);
  const [closing, setClosing] = createSignal(false);
  let iframe: HTMLIFrameElement | undefined;
  let bridge: AppBridge | undefined;
  let initializedFor = '';
  let disposed = false;

  const closeBridge = async (releaseBackend: boolean) => {
    const current = bridge;
    bridge = undefined;
    if (current) {
      try {
        await current.teardownResource({}, { timeout: 2_000 });
      } catch {
        // The iframe may not have completed initialization. Closing the
        // transport is still required and safe.
      }
      await current.close();
    }
    if (releaseBackend) await props.client.closeMcpApp(ref());
  };

  const setup = async (appPayload: McpAppPayload) => {
    if (!iframe || disposed) return;
    if (appPayload.resource.mime_type !== RESOURCE_MIME_TYPE) {
      throw new Error(`Unsupported MCP App MIME type: ${appPayload.resource.mime_type}`);
    }
    const sandboxUrl = new URL(appPayload.sandbox_url);
    if (sandboxUrl.origin === window.location.origin) {
      throw new Error('MCP App sandbox must be served from a different origin than the host');
    }
    const csp = appPayload.resource.csp as McpUiResourceCsp | undefined;
    const permissions = appPayload.resource.permissions as McpUiResourcePermissions | undefined;
    const allow = buildAllowAttribute(permissions);
    if (allow) iframe.setAttribute('allow', allow);

    const next = new AppBridge(
      null,
      { name: 'CLIO', version: '1.0.0' },
      {
        serverTools: {},
        serverResources: {},
        logging: {},
        message: { text: {} },
        updateModelContext: { text: {} },
        sandbox: { csp, permissions },
      },
      {
        hostContext: {
          platform: platform(),
          theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
          displayMode: 'inline',
          availableDisplayModes: ['inline'],
          containerDimensions: { width: iframe.clientWidth || 960, maxHeight: 1200 },
        },
      },
    );
    bridge = next;

    next.oncalltool = async (params) => {
      const result = await props.client.callMcpAppTool(ref(), {
        name: params.name,
        arguments: params.arguments,
      });
      return result as unknown as CallToolResult;
    };
    next.onreadresource = async (params) => {
      const result = await props.client.readMcpAppResource(ref(), params.uri);
      return result as unknown as ReadResourceResult;
    };
    next.onmessage = async (params) => {
      await props.client.postMcpAppMessage(
        ref(),
        params as unknown as Record<string, unknown>,
      );
      return {};
    };
    next.onupdatemodelcontext = async (params) => {
      await props.client.updateMcpAppModelContext(
        ref(),
        params as unknown as Record<string, unknown>,
      );
      return {};
    };
    next.onloggingmessage = () => undefined;
    next.onsizechange = ({ height: requestedHeight }) => {
      if (requestedHeight !== undefined && Number.isFinite(requestedHeight)) {
        setHeight(Math.max(240, Math.min(1200, Math.ceil(requestedHeight))));
      }
    };
    next.onsandboxready = () => {
      void next.sendSandboxResourceReady({
        html: appPayload.resource.html,
        csp,
        permissions,
      });
    };
    next.oninitialized = () => {
      void next.sendToolInput({ arguments: appPayload.tool_input });
      void next.sendToolResult(appPayload.tool_result as unknown as CallToolResult);
    };

    await next.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
    if (!disposed) iframe.src = sandboxUrl.toString();
  };

  createEffect(() => {
    const appPayload = payload();
    if (!appPayload || !iframe || closed()) return;
    const identity = `${props.sessionId}:${props.part.app_instance_id}`;
    if (initializedFor === identity) return;
    initializedFor = identity;
    void setup(appPayload).catch((error: unknown) => {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    });
  });

  onCleanup(() => {
    disposed = true;
    void closeBridge(false);
  });

  const close = async () => {
    if (closing() || closed()) return;
    setClosing(true);
    try {
      await closeBridge(true);
      setClosed(true);
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : String(error));
    } finally {
      setClosing(false);
    }
  };

  const error = () => runtimeError() || (payload.error ? String(payload.error) : '');

  return (
    <section class="mcp-app" data-testid="mcp-app-part" data-source={props.part.source_server}>
      <header class="mcp-app__header">
        <span class="mcp-app__identity">
          Interactive view - {props.part.source_server || 'MCP server'}
        </span>
        <button
          type="button"
          class="mcp-app__close"
          disabled={closing() || closed()}
          onClick={() => void close()}
          data-testid="mcp-app-close"
        >
          {closing() ? 'Closing...' : closed() ? 'Closed' : 'Close'}
        </button>
      </header>
      <Show when={error()}>
        {(message) => (
          <div class="mcp-app__error" role="alert" data-testid="mcp-app-error">
            {message()}
          </div>
        )}
      </Show>
      <Show when={!closed()}>
        <iframe
          ref={iframe}
          class="mcp-app__frame"
          title={`Interactive ${props.part.source_server || 'MCP'} application`}
          sandbox="allow-scripts allow-same-origin allow-forms"
          style={{ height: `${height()}px` }}
          data-testid="mcp-app-iframe"
        />
      </Show>
    </section>
  );
}
