import {
  TransportError,
  type ClioRepository,
  type McpAppDescriptor,
  type McpAppIdentity,
  type McpAppSavedDownload,
} from '@clio/core/v3';
import { mcpAppStyleVariables } from './mcp-app-host-styles';
import { t } from '@lingui/core/macro';

/** The MCP Apps revision CLIO declares; draft features are offered by capability. */
export const MCP_APPS_PROTOCOL_VERSION = '2026-01-26';

/** The display modes CLIO offers (MA1): the card and a workbench tab. No `pip`. */
export const AVAILABLE_DISPLAY_MODES = ['inline', 'fullscreen'] as const;
export type McpAppViewDisplayMode = (typeof AVAILABLE_DISPLAY_MODES)[number];

/** Where a surface's frame sits; a surface is an A2UI component (MA20). */
export type McpAppPlacementKind = 'inline' | 'tab' | 'surface';

export type McpAppClient = Pick<
  ClioRepository,
  | 'mcpAppDescriptor'
  | 'callMcpAppTool'
  | 'readMcpAppResource'
  | 'updateMcpAppModelContext'
  | 'postMcpAppMessage'
  | 'saveMcpAppDownload'
  | 'openBrowserPage'
  | 'updateMcpAppTools'
  | 'postMcpAppToolResult'
> &
  Partial<Pick<ClioRepository, 'setMcpAppShown' | 'postMcpAppLook'>>;

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** A refusal the view receives as a JSON-RPC error with a typed `data.reason`. */
export class McpAppRpcFailure extends Error {
  public constructor(
    message: string,
    public readonly reason: string,
    public readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'McpAppRpcFailure';
  }
}

export function displayModeFor(placement: McpAppPlacementKind): McpAppViewDisplayMode {
  return placement === 'tab' ? 'fullscreen' : 'inline';
}

export function isJsonRpcMessage(value: unknown): value is JsonRpcMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.jsonrpc !== '2.0') return false;
  return typeof row.method === 'string' || 'id' in row;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function rpcError(
  id: JsonRpcMessage['id'],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcMessage {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

/** The error a failed bridge request becomes; typed refusals keep their reason. */
export function rpcFailure(id: JsonRpcMessage['id'], thrown: unknown): JsonRpcMessage {
  if (thrown instanceof McpAppRpcFailure) {
    const code = thrown.reason === 'unsupported_method' ? -32601 : -32000;
    return rpcError(id, code, thrown.message, { reason: thrown.reason, ...thrown.detail });
  }
  if (thrown instanceof TransportError && thrown.code) {
    return rpcError(id, -32000, thrown.message, { reason: thrown.code });
  }
  // i18n-ignore: JSON-RPC error returned to the MCP App
  return rpcError(id, -32000, thrown instanceof Error ? thrown.message : 'MCP App request failed');
}

export function validateDescriptor(
  descriptor: McpAppDescriptor,
  resourceUri: string,
  identity: McpAppIdentity,
): void {
  if (descriptor.protocol_version !== MCP_APPS_PROTOCOL_VERSION) {
    throw new Error(t`This interactive tool uses an unsupported protocol version.`);
  }
  if (descriptor.resource.uri !== resourceUri || !resourceUri.startsWith('ui://')) {
    throw new Error(t`The interactive tool resource did not match its message.`);
  }
  if (!/^text\/html\s*;\s*profile=mcp-app(?:\s*;|$)/iu.test(descriptor.resource.mime_type)) {
    throw new Error(t`The interactive tool resource is not MCP App HTML.`);
  }
  const sandbox = new URL(descriptor.sandbox_url);
  if (sandbox.origin === window.location.origin) {
    throw new Error(t`The interactive tool sandbox is not isolated from the workspace.`);
  }
  const expectedPath = `/v1/sessions/${encodeURIComponent(identity.sessionId)}/mcp-apps/${encodeURIComponent(identity.appInstanceId)}/sandbox`;
  if (
    sandbox.pathname !== expectedPath ||
    sandbox.searchParams.get('data_ref') !== identity.dataRef
  ) {
    throw new Error(t`The interactive tool sandbox did not match its capability identity.`);
  }
}

/**
 * Host capabilities CLIO answers `ui/initialize` with (MA17): the draft's
 * `openLinks` and `downloadFile` let views enable those controls.
 */
export function hostCapabilities(descriptor: McpAppDescriptor) {
  return {
    openLinks: {},
    downloadFile: {},
    serverTools: {},
    serverResources: {},
    logging: {},
    updateModelContext: { text: {}, structuredContent: {} },
    message: { text: {} },
    sandbox: { csp: descriptor.resource.csp, permissions: descriptor.resource.permissions },
  };
}

export function hostContext(
  iframe: HTMLIFrameElement,
  placement: McpAppPlacementKind,
  extra: Record<string, unknown> = {},
) {
  const touch = navigator.maxTouchPoints > 0;
  const width = Math.max(1, iframe.clientWidth);
  const height = Math.max(1, iframe.clientHeight);
  return {
    ...extra,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
    // CLIO's notebook look, as the spec's standardized variables (mcp-app-host-styles.ts).
    styles: { variables: mcpAppStyleVariables() },
    displayMode: displayModeFor(placement),
    availableDisplayModes: placement === 'surface' ? ['inline'] : [...AVAILABLE_DISPLAY_MODES],
    // A tab fixes the view's size; a card lets the view choose its height.
    containerDimensions: placement === 'tab' ? { width, height } : { width, maxHeight: 720 },
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

export function initializeResult(
  descriptor: McpAppDescriptor,
  iframe: HTMLIFrameElement,
  placement: McpAppPlacementKind,
  extra: Record<string, unknown> = {},
) {
  return {
    protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    hostCapabilities: hostCapabilities(descriptor),
    // i18n-ignore: host identity sent to the MCP App
    hostInfo: { name: 'Agent Workspace', version: '0.11.0' },
    hostContext: hostContext(iframe, placement, extra),
  };
}

/**
 * The mode a `ui/request-display-mode` resolves to (MA2): `fullscreen` and
 * `inline` move the frame when the view declared them; `pip`, an undeclared
 * mode, or a surface placement answer with the current mode.
 */
export function resolveDisplayMode(
  requested: unknown,
  placement: McpAppPlacementKind,
  appCapabilities: Record<string, unknown> | undefined,
): McpAppViewDisplayMode {
  const current = displayModeFor(placement);
  if (placement === 'surface') return current;
  if (requested !== 'inline' && requested !== 'fullscreen') return current;
  const declared = appCapabilities?.availableDisplayModes;
  if (Array.isArray(declared) && !declared.includes(requested)) return current;
  return requested;
}

/** `ui/open-link` (MA15): `http` and `https` open a page in the in-app browser. */
export function checkedLink(raw: unknown): URL {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new McpAppRpcFailure('The link has no address.', 'invalid_url');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpAppRpcFailure('The link is not a valid address.', 'invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new McpAppRpcFailure(
      `Only http and https links open here, not ${url.protocol.replace(/:$/u, '')}.`,
      'unsupported_scheme',
      { scheme: url.protocol.replace(/:$/u, '') },
    );
  }
  return url;
}

export interface BridgeHooks {
  onModelContext?: (context: Record<string, unknown>) => void;
  onBrowserPage?: (page: { id: string; title?: string; host?: string }) => void;
  onDownloaded?: (files: readonly McpAppSavedDownload[]) => void;
}

/** Answer one view request that goes to the server (or the host's browser). */
export async function bridgeRequest(
  repository: McpAppClient,
  identity: McpAppIdentity,
  message: JsonRpcMessage,
  hooks: BridgeHooks,
): Promise<unknown> {
  const params = message.params ?? {};
  switch (message.method) {
    case 'tools/call': {
      const name = typeof params.name === 'string' ? params.name : '';
      const argumentsValue = isRecord(params.arguments) ? params.arguments : {};
      if (!name) throw new Error('MCP App tool request has no name.');
      return repository.callMcpAppTool(identity, { name, arguments: argumentsValue });
    }
    case 'resources/read':
      if (typeof params.uri !== 'string') throw new Error('MCP App resource request has no URI.');
      return repository.readMcpAppResource(identity, params.uri);
    case 'ui/update-model-context': {
      const result = await repository.updateMcpAppModelContext(identity, params);
      hooks.onModelContext?.(params);
      return result ?? {};
    }
    case 'ui/message':
      return repository.postMcpAppMessage(identity, params);
    case 'ui/open-link': {
      const url = checkedLink(params.url);
      const page = await repository.openBrowserPage(identity.sessionId, url.href);
      hooks.onBrowserPage?.(page);
      return {};
    }
    case 'ui/download-file': {
      const saved = await repository.saveMcpAppDownload(identity, params);
      hooks.onDownloaded?.(saved.files);
      return { files: saved.files };
    }
    default:
      throw new McpAppRpcFailure(
        `Unsupported MCP App method: ${message.method}`,
        'unsupported_method',
      );
  }
}
