import {
  TransportError,
  type ClioRepository,
  type McpAppDescriptor,
  type McpAppIdentity,
} from '@clio/core/v3';
import { AlertTriangleIcon, PanelsTopLeftIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ClioStatus } from './status';

export const MCP_APPS_PROTOCOL_VERSION = '2026-01-26';

type McpAppClient = Pick<
  ClioRepository,
  | 'mcpAppDescriptor'
  | 'callMcpAppTool'
  | 'readMcpAppResource'
  | 'updateMcpAppModelContext'
  | 'postMcpAppMessage'
  | 'closeMcpApp'
>;

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

const pendingCloses = new Map<string, ReturnType<typeof setTimeout>>();
const closedApps = new Set<string>();

export interface McpAppSurfaceProps {
  appInstanceId: string;
  dataRef: string;
  height?: number;
  repository: McpAppClient;
  resourceUri: string;
  sessionId: string;
  sourceServer: string;
}

/** Host one MCP App at the tool result that produced it. */
export function McpAppSurface(props: McpAppSurfaceProps) {
  const identityKey = `${props.sessionId}:${props.appInstanceId}:${props.dataRef}`;
  return <McpAppSurfaceInstance key={identityKey} {...props} />;
}

function McpAppSurfaceInstance(props: McpAppSurfaceProps) {
  const identity = useMemo<McpAppIdentity>(
    () => ({
      sessionId: props.sessionId,
      appInstanceId: props.appInstanceId,
      dataRef: props.dataRef,
    }),
    [props.appInstanceId, props.dataRef, props.sessionId],
  );
  const identityKey = `${identity.sessionId}:${identity.appInstanceId}:${identity.dataRef}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [descriptor, setDescriptor] = useState<McpAppDescriptor>();
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [requestedHeight, setRequestedHeight] = useState(props.height ?? 420);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const frameHeight = Math.min(
    720,
    Math.max(180, viewportHeight - 180),
    Math.max(180, requestedHeight),
  );

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const pending = pendingCloses.get(identityKey);
    if (pending) {
      clearTimeout(pending);
      pendingCloses.delete(identityKey);
    }
    const controller = new AbortController();
    void loadDescriptor(props.repository, identity, controller.signal)
      .then((next) => {
        validateDescriptor(next, props.resourceUri, identity);
        setDescriptor(next);
      })
      .catch((thrown) => {
        if (!controller.signal.aborted) {
          setError(thrown instanceof Error ? thrown.message : String(thrown));
        }
      });
    return () => controller.abort();
  }, [identity, identityKey, props.repository, props.resourceUri]);

  useLayoutEffect(() => {
    if (!descriptor) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const targetWindow = iframe.contentWindow;
    if (!targetWindow) return;
    const sandboxOrigin = new URL(descriptor.sandbox_url).origin;
    let active = true;
    let initialized = false;
    const post = (message: JsonRpcMessage) => targetWindow.postMessage(message, sandboxOrigin);
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!active || event.source !== targetWindow || event.origin !== sandboxOrigin) return;
      if (!isJsonRpcMessage(event.data)) return;
      const message = event.data;
      if (message.method === 'ui/notifications/sandbox-proxy-ready') {
        post({
          jsonrpc: '2.0',
          method: 'ui/notifications/sandbox-resource-ready',
          params: {
            html: descriptor.resource.html,
            csp: descriptor.resource.csp,
            permissions: descriptor.resource.permissions,
          },
        });
        return;
      }
      if (message.method === 'ui/initialize') {
        if (message.id === undefined) return;
        if (
          message.params?.protocolVersion !== MCP_APPS_PROTOCOL_VERSION ||
          !isRecord(message.params.appInfo) ||
          !isRecord(message.params.appCapabilities)
        ) {
          post(rpcError(message.id, -32602, 'Unsupported MCP Apps protocol version'));
          return;
        }
        post({
          jsonrpc: '2.0',
          id: message.id,
          result: initializeResult(descriptor, iframe),
        });
        return;
      }
      if (message.method === 'ping') {
        if (message.id !== undefined) post({ jsonrpc: '2.0', id: message.id, result: {} });
        return;
      }
      if (message.method === 'ui/notifications/initialized') {
        initialized = true;
        setReady(true);
        post({
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-input',
          params: { arguments: descriptor.tool_input },
        });
        post({
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: descriptor.tool_result,
        });
        return;
      }
      if (message.method === 'ui/notifications/size-changed') {
        const height = message.params?.height;
        if (typeof height === 'number' && Number.isFinite(height)) {
          setRequestedHeight(Math.round(height));
        }
        return;
      }
      if (message.method === 'notifications/message') return;
      if (!message.method || message.id === undefined) return;
      void bridgeRequest(props.repository, identity, message)
        .then((result) => {
          if (active) post({ jsonrpc: '2.0', id: message.id, result });
        })
        .catch((thrown) => {
          if (active) {
            post(
              rpcError(
                message.id,
                -32000,
                thrown instanceof Error ? thrown.message : 'MCP App request failed',
              ),
            );
          }
        });
    };
    const notifyContext = () => {
      if (!initialized) return;
      post({
        jsonrpc: '2.0',
        method: 'ui/notifications/host-context-changed',
        params: hostContext(iframe),
      });
    };
    const themeObserver = new MutationObserver(notifyContext);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
    });
    window.addEventListener('resize', notifyContext);
    window.addEventListener('message', onMessage);
    return () => {
      active = false;
      themeObserver.disconnect();
      window.removeEventListener('resize', notifyContext);
      window.removeEventListener('message', onMessage);
      post({
        jsonrpc: '2.0',
        id: `teardown:${props.appInstanceId}`,
        method: 'ui/resource-teardown',
        params: {},
      });
    };
  }, [descriptor, identity, props.appInstanceId, props.repository]);

  useEffect(
    () => () => {
      if (closedApps.has(identityKey)) return;
      const pending = setTimeout(() => {
        pendingCloses.delete(identityKey);
        if (closedApps.has(identityKey)) return;
        closedApps.add(identityKey);
        void props.repository.closeMcpApp(identity).catch(() => {
          closedApps.delete(identityKey);
        });
      }, 0);
      pendingCloses.set(identityKey, pending);
    },
    [identity, identityKey, props.repository],
  );

  return (
    <Frame className="min-w-0 overflow-hidden" data-mcp-app={props.appInstanceId} spacing={null}>
      <FrameHeader className="flex-row items-center gap-2 border-b px-3 py-2">
        <PanelsTopLeftIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <FrameTitle className="min-w-0 flex-1 truncate">
          {props.sourceServer || 'Interactive tool'}
        </FrameTitle>
        <ClioStatus label={ready ? 'Ready' : 'Loading'} value={ready ? 'succeeded' : 'running'} />
      </FrameHeader>
      <FramePanel className="relative min-w-0 p-0" style={{ minHeight: frameHeight }}>
        {error ? (
          <div className="grid min-h-[15rem] place-items-center p-4">
            <Alert className="max-w-lg" variant="destructive">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertTitle>Interactive tool unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : descriptor ? (
          <iframe
            className="block w-full border-0 bg-background"
            data-mcp-app-iframe={props.appInstanceId}
            ref={iframeRef}
            referrerPolicy="origin"
            sandbox="allow-scripts allow-same-origin"
            src={descriptor.sandbox_url}
            style={{ height: frameHeight }}
            title={`${props.sourceServer || 'Tool'} interactive view`}
          />
        ) : (
          <div className="grid gap-3 p-4" style={{ minHeight: frameHeight }}>
            <Skeleton className="h-8 w-2/5" />
            <Skeleton className="h-full min-h-40 w-full" />
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}

async function loadDescriptor(
  repository: McpAppClient,
  identity: McpAppIdentity,
  signal: AbortSignal,
): Promise<McpAppDescriptor> {
  try {
    return await repository.mcpAppDescriptor(identity, signal);
  } catch (error) {
    if (
      signal.aborted ||
      !(error instanceof TransportError) ||
      error.code !== 'network_unavailable'
    ) {
      throw error;
    }
    // A live tool result can settle while the browser is completing the
    // descriptor's CORS preflight. Retry that transient once; persistent
    // connection failures still become the contained error state.
    return repository.mcpAppDescriptor(identity, signal);
  }
}

export function McpAppHistoryLine({ sourceServer }: { sourceServer: string }) {
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-lg border bg-muted/25 px-3 text-sm text-muted-foreground">
      <PanelsTopLeftIcon aria-hidden="true" className="size-4" />
      <span>{sourceServer || 'Interactive tool'} view closed</span>
    </div>
  );
}

function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.jsonrpc !== '2.0') return false;
  return typeof row.method === 'string' || 'id' in row;
}

function validateDescriptor(
  descriptor: McpAppDescriptor,
  resourceUri: string,
  identity: McpAppIdentity,
): void {
  if (descriptor.protocol_version !== MCP_APPS_PROTOCOL_VERSION) {
    throw new Error('This interactive tool uses an unsupported protocol version.');
  }
  if (descriptor.resource.uri !== resourceUri || !resourceUri.startsWith('ui://')) {
    throw new Error('The interactive tool resource did not match its message.');
  }
  if (!/^text\/html\s*;\s*profile=mcp-app(?:\s*;|$)/iu.test(descriptor.resource.mime_type)) {
    throw new Error('The interactive tool resource is not MCP App HTML.');
  }
  const sandbox = new URL(descriptor.sandbox_url);
  if (sandbox.origin === window.location.origin) {
    throw new Error('The interactive tool sandbox is not isolated from the workspace.');
  }
  const expectedPath = `/v1/sessions/${encodeURIComponent(identity.sessionId)}/mcp-apps/${encodeURIComponent(identity.appInstanceId)}/sandbox`;
  if (
    sandbox.pathname !== expectedPath ||
    sandbox.searchParams.get('data_ref') !== identity.dataRef
  ) {
    throw new Error('The interactive tool sandbox did not match its capability identity.');
  }
}

function initializeResult(descriptor: McpAppDescriptor, iframe: HTMLIFrameElement) {
  return {
    protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    hostCapabilities: {
      serverTools: {},
      serverResources: {},
      logging: {},
      sandbox: { csp: descriptor.resource.csp, permissions: descriptor.resource.permissions },
    },
    hostInfo: { name: 'Agent Workspace', version: '0.11.0' },
    hostContext: hostContext(iframe),
  };
}

function hostContext(iframe: HTMLIFrameElement) {
  const touch = navigator.maxTouchPoints > 0;
  return {
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    containerDimensions: {
      width: Math.max(1, iframe.clientWidth),
      height: Math.max(1, iframe.clientHeight),
    },
    locale: navigator.language || 'en',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
    platform: 'web',
    deviceCapabilities: {
      touch,
      hover: window.matchMedia?.('(hover: hover)').matches ?? false,
    },
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

async function bridgeRequest(
  repository: McpAppClient,
  identity: McpAppIdentity,
  message: JsonRpcMessage,
): Promise<unknown> {
  const params = message.params ?? {};
  if (message.method === 'tools/call') {
    const name = typeof params.name === 'string' ? params.name : '';
    const argumentsValue = isRecord(params.arguments) ? params.arguments : {};
    if (!name) throw new Error('MCP App tool request has no name.');
    return repository.callMcpAppTool(identity, { name, arguments: argumentsValue });
  }
  if (message.method === 'resources/read') {
    if (typeof params.uri !== 'string') throw new Error('MCP App resource request has no URI.');
    return repository.readMcpAppResource(identity, params.uri);
  }
  if (message.method === 'ui/update-model-context') {
    return repository.updateMcpAppModelContext(identity, params);
  }
  if (message.method === 'ui/request-display-mode') {
    return { mode: 'inline' };
  }
  if (message.method === 'ui/message') {
    return repository.postMcpAppMessage(identity, params);
  }
  throw new Error(`Unsupported MCP App method: ${message.method}`);
}

function rpcError(id: JsonRpcMessage['id'], code: number, message: string): JsonRpcMessage {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
