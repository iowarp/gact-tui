import { TransportError, type McpAppDescriptor, type McpAppIdentity } from '@clio/core/v3';
import { AlertTriangleIcon, CornerDownRightIcon, PanelsTopLeftIcon } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  bridgeRequest,
  hostContext,
  initializeResult,
  isJsonRpcMessage,
  isRecord,
  MCP_APPS_PROTOCOL_VERSION,
  resolveDisplayMode,
  rpcError,
  rpcFailure,
  validateDescriptor,
  displayModeFor,
  type BridgeHooks,
  type JsonRpcMessage,
  type McpAppClient,
  type McpAppPlacementKind,
  type McpAppViewDisplayMode,
} from './mcp-app-bridge';
import { mcpAppLabel } from './mcp-app-live-set';
import { mcpAppServiceHostContext } from './mcp-app-service';
import { ClioStatus } from './status';

export { MCP_APPS_PROTOCOL_VERSION } from './mcp-app-bridge';

export interface McpAppSurfaceProps extends BridgeHooks {
  appInstanceId: string;
  dataRef: string;
  height?: number;
  repository: McpAppClient;
  resourceUri: string;
  sessionId: string;
  sourceServer: string;
  toolName: string;
  /** The App's name in the header and frame title; the tool's name when absent. */
  label?: string;
  /** Where the frame is: the card, a workbench tab or an A2UI surface (MA1, MA20). */
  placement?: McpAppPlacementKind;
  /** Header controls beside the title ("Open in tab", "Return to conversation"). */
  actions?: ReactNode;
  /** The view asked for another mode and the host granted it (MA2). */
  onDisplayModeChange?: (mode: McpAppViewDisplayMode) => void;
  /**
   * The descriptor reports a mode this placement does not hold (a reload, another
   * window). Return true when the frame belongs elsewhere and must not mount here.
   */
  onRecordedDisplayMode?: (mode: McpAppViewDisplayMode) => boolean;
  /** The record is gone on the server (404). */
  onEnded?: () => void;
  /** The view finished `ui/initialize`; its declared `appCapabilities`. */
  onAppInitialized?: (appCapabilities: Record<string, unknown>) => void;
  /** A notification the host does not consume itself (`notifications/tools/list_changed`). */
  onViewNotification?: (method: string, params: Record<string, unknown>) => void;
}

/** Drive the view directly: app tools (MA13) and channel inputs (MA21). */
export interface McpAppSurfaceHandle {
  /** `tools/call` to the view's own tools; waits for the view without a timeout (rule 6). */
  callAppTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Send `ui/notifications/tool-input` with new arguments. */
  sendToolInput: (args: Record<string, unknown>) => void;
  /** Send any request to the view (`tools/list`, …) and wait for its answer. */
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

export interface McpAppResponseActivityData {
  appInstanceId: string;
  createdAt: string;
  messageId: string;
  sourceServer: string;
  state: 'delivered' | 'pending';
  text: string;
  toolName: string;
}

interface ViewChannel {
  ready: Promise<void>;
  markReady: () => void;
  post?: (message: JsonRpcMessage) => void;
  pending: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>;
  next: number;
}

function newChannel(): ViewChannel {
  let markReady = () => undefined as void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  return { ready, markReady, pending: new Map(), next: 0 };
}

/** Host one MCP App: one frame, wherever its placement puts it (MA3). */
export const McpAppSurface = forwardRef<McpAppSurfaceHandle, McpAppSurfaceProps>(
  function McpAppSurface(props, ref) {
    const placement = props.placement ?? 'inline';
    // A move between placements reloads the frame and replays initialize, input and result.
    const identityKey = `${props.sessionId}:${props.appInstanceId}:${props.dataRef}:${placement}`;
    return <McpAppSurfaceInstance key={identityKey} {...props} ref={ref} placement={placement} />;
  },
);

const McpAppSurfaceInstance = forwardRef<
  McpAppSurfaceHandle,
  McpAppSurfaceProps & { placement: McpAppPlacementKind }
>(function McpAppSurfaceInstance(props, ref) {
  const { placement } = props;
  const identity = useMemo<McpAppIdentity>(
    () => ({
      sessionId: props.sessionId,
      appInstanceId: props.appInstanceId,
      dataRef: props.dataRef,
    }),
    [props.appInstanceId, props.dataRef, props.sessionId],
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [descriptor, setDescriptor] = useState<McpAppDescriptor>();
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [ready, setReady] = useState(false);
  const [requestedHeight, setRequestedHeight] = useState(props.height ?? 420);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  const channel = useRef<ViewChannel>(newChannel());
  // Callbacks read at call time, so a parent re-render never rebuilds the bridge.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const frameHeight =
    placement === 'surface' && props.height
      ? props.height
      : Math.min(720, Math.max(180, viewportHeight - 180), Math.max(180, requestedHeight));

  useImperativeHandle(ref, () => {
    const request = async (method: string, params: Record<string, unknown> = {}) => {
      await channel.current.ready;
      const post = channel.current.post;
      if (!post) throw new Error('The interactive view is not open.');
      const id = `host:${(channel.current.next += 1)}`;
      return new Promise<unknown>((resolve, reject) => {
        channel.current.pending.set(id, { resolve, reject });
        post({ jsonrpc: '2.0', id, method, params });
      });
    };
    return {
      request,
      callAppTool: (name, args) => request('tools/call', { name, arguments: args }),
      sendToolInput: (args) => {
        channel.current.post?.({
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-input',
          params: { arguments: args },
        });
      },
    };
  }, []);

  useEffect(() => {
    if (placement === 'tab') return;
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [placement]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDescriptor(props.repository, identity, controller.signal)
      .then((next) => {
        validateDescriptor(next, props.resourceUri, identity);
        const recorded = next.display_mode ?? 'inline';
        if (placement !== 'surface' && recorded !== displayModeFor(placement)) {
          // The record's frame is elsewhere: never mount a second one (MA3).
          if (latest.current.onRecordedDisplayMode?.(recorded)) return;
        }
        setDescriptor(next);
      })
      .catch((thrown) => {
        if (controller.signal.aborted) return;
        if (isEndedAppError(thrown)) {
          setEnded(true);
          latest.current.onEnded?.();
        } else {
          setError(thrown instanceof Error ? thrown.message : String(thrown));
        }
      });
    return () => controller.abort();
  }, [identity, placement, props.repository, props.resourceUri]);

  useLayoutEffect(() => {
    if (!descriptor) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const targetWindow = iframe.contentWindow;
    if (!targetWindow) return;
    const sandboxOrigin = new URL(descriptor.sandbox_url).origin;
    const view = channel.current;
    let active = true;
    let initialized = false;
    let appCapabilities: Record<string, unknown> | undefined;
    const post = (message: JsonRpcMessage) => targetWindow.postMessage(message, sandboxOrigin);
    view.post = post;
    const answer = (message: JsonRpcMessage) => {
      const pending = view.pending.get(String(message.id));
      if (!pending) return;
      view.pending.delete(String(message.id));
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!active || event.source !== targetWindow || event.origin !== sandboxOrigin) return;
      if (!isJsonRpcMessage(event.data)) return;
      const message = event.data;
      if (!message.method) {
        answer(message);
        return;
      }
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
        appCapabilities = message.params.appCapabilities;
        post({
          jsonrpc: '2.0',
          id: message.id,
          result: initializeResult(
            descriptor,
            iframe,
            placement,
            mcpAppServiceHostContext(descriptor, identity),
          ),
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
        view.markReady();
        latest.current.onAppInitialized?.(appCapabilities ?? {});
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
      if (message.id === undefined) {
        latest.current.onViewNotification?.(message.method, message.params ?? {});
        return;
      }
      if (message.method === 'ui/request-display-mode') {
        const mode = resolveDisplayMode(message.params?.mode, placement, appCapabilities);
        post({ jsonrpc: '2.0', id: message.id, result: { mode } });
        // The answer reaches this frame before the move unmounts it.
        if (mode !== displayModeFor(placement)) {
          window.setTimeout(() => latest.current.onDisplayModeChange?.(mode), 0);
        }
        return;
      }
      void bridgeRequest(latest.current.repository, identity, message, {
        onModelContext: (context) => latest.current.onModelContext?.(context),
        onBrowserPage: (page) => latest.current.onBrowserPage?.(page),
        onDownloaded: (files) => latest.current.onDownloaded?.(files),
      })
        .then((result) => {
          if (active) post({ jsonrpc: '2.0', id: message.id, result });
        })
        .catch((thrown) => {
          if (active) post(rpcFailure(message.id, thrown));
        });
    };
    const notifyContext = () => {
      if (!initialized) return;
      post({
        jsonrpc: '2.0',
        method: 'ui/notifications/host-context-changed',
        params: hostContext(iframe, placement, mcpAppServiceHostContext(descriptor, identity)),
      });
    };
    const themeObserver = new MutationObserver(notifyContext);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
    });
    // A tab's size is the view's container: report every change of it.
    const sizeObserver = new ResizeObserver(notifyContext);
    if (placement === 'tab') sizeObserver.observe(iframe);
    window.addEventListener('resize', notifyContext);
    window.addEventListener('message', onMessage);
    return () => {
      active = false;
      view.post = undefined;
      for (const pending of view.pending.values())
        pending.reject(new Error('The interactive view closed.'));
      view.pending.clear();
      channel.current = newChannel();
      themeObserver.disconnect();
      sizeObserver.disconnect();
      window.removeEventListener('resize', notifyContext);
      window.removeEventListener('message', onMessage);
      post({
        jsonrpc: '2.0',
        id: `teardown:${props.appInstanceId}`,
        method: 'ui/resource-teardown',
        params: {},
      });
    };
  }, [descriptor, identity, placement, props.appInstanceId]);

  if (ended) {
    return <McpAppHistoryLine sourceServer={props.sourceServer} toolName={props.toolName} />;
  }

  const displayName = props.label || mcpAppLabel(props.toolName, props.sourceServer);
  const fill = placement === 'tab';
  return (
    <Frame
      className={cn(
        'min-w-0 overflow-hidden',
        fill && 'flex h-full flex-col rounded-none border-0',
      )}
      data-mcp-app={props.appInstanceId}
      data-mcp-app-placement={placement}
      spacing={null}
    >
      <FrameHeader className="flex-row items-center gap-2 border-b px-3 py-2">
        <PanelsTopLeftIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        <FrameTitle className="min-w-0 flex-1 truncate">{displayName}</FrameTitle>
        <ClioStatus label={ready ? 'Ready' : 'Loading'} value={ready ? 'succeeded' : 'running'} />
        {props.actions}
      </FrameHeader>
      <FramePanel
        className={cn('relative min-w-0 p-0', fill && 'min-h-0 flex-1')}
        style={fill ? undefined : { minHeight: frameHeight }}
      >
        {error ? (
          <div className="grid min-h-[15rem] place-items-center p-4">
            <Alert className="max-w-lg" variant="destructive">
              <AlertTriangleIcon aria-hidden="true" />
              <AlertTitle>Interactive tool unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : descriptor ? (
          <>
            {descriptor.service_refusal ? (
              <p
                className="border-b px-3 py-2 text-xs text-muted-foreground"
                data-mcp-app-service-refusal={descriptor.service_refusal.reason}
                role="status"
              >
                {descriptor.service_refusal.message}
              </p>
            ) : null}
            <iframe
              className={cn(
                'block w-full border-0 bg-background',
                fill && 'absolute inset-0 h-full',
              )}
              data-mcp-app-iframe={props.appInstanceId}
              ref={iframeRef}
              referrerPolicy="origin"
              sandbox="allow-scripts allow-same-origin"
              src={descriptor.sandbox_url}
              style={fill ? undefined : { height: frameHeight }}
              title={`${displayName} interactive view`}
            />
          </>
        ) : (
          <div
            className={cn('grid gap-3 p-4', fill && 'h-full')}
            style={fill ? undefined : { minHeight: frameHeight }}
          >
            <Skeleton className="h-8 w-2/5" />
            <Skeleton className="h-full min-h-40 w-full" />
          </div>
        )}
      </FramePanel>
    </Frame>
  );
});

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

export function McpAppHistoryLine({
  sourceServer,
  toolName,
}: {
  sourceServer: string;
  toolName: string;
}) {
  const displayName = mcpAppLabel(toolName, sourceServer);
  const serverOnly = !toolName.trim();
  return (
    <div className="flex min-h-10 items-center gap-2 rounded-lg border bg-muted/20 px-3 text-sm">
      <PanelsTopLeftIcon aria-hidden="true" className="size-4" />
      {serverOnly ? (
        <span className="min-w-0 flex-1 truncate text-foreground/85">
          {displayName} view closed
        </span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-foreground/85">{displayName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">View ended</span>
        </>
      )}
    </div>
  );
}

/** Render a message emitted by an App as causal ledger activity, not composer chat. */
export function McpAppResponseActivity({ response }: { response: McpAppResponseActivityData }) {
  const displayName = mcpAppLabel(response.toolName, response.sourceServer);
  return (
    <div
      className="flex min-w-0 items-start gap-3 border-l-2 border-primary/35 py-1 pl-3 text-sm"
      data-mcp-app-response={response.appInstanceId}
      data-turn-activity={`mcp-app-response:${response.messageId}`}
    >
      <CornerDownRightIcon
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium text-foreground">You responded through {displayName}</span>
          <time
            className="font-mono text-[10px] text-muted-foreground"
            dateTime={response.createdAt}
          >
            {new Date(response.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </div>
        {response.text ? (
          <p className="whitespace-pre-wrap text-foreground/85">{response.text}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {response.state === 'pending' ? 'Queued for the agent' : 'Sent to the agent'}
        </p>
      </div>
    </div>
  );
}

function isEndedAppError(error: unknown): boolean {
  return error instanceof TransportError && error.status === 404 && error.code === 'not_found';
}
