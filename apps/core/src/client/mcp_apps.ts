import type { HttpTransport } from './transport.js';

export interface McpAppRef {
  sessionId: string;
  appInstanceId: string;
  dataRef: string;
}

export interface McpContentBlock {
  type: string;
  [key: string]: unknown;
}

export interface McpCallToolResult {
  content: McpContentBlock[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpReadResourceResult {
  contents: Array<Record<string, unknown>>;
}

export interface McpAppPayload {
  protocol_version: '2026-01-26';
  resource: {
    uri: string;
    mime_type: 'text/html;profile=mcp-app';
    html: string;
    csp?: Record<string, unknown>;
    permissions?: Record<string, unknown>;
  };
  tool_input: Record<string, unknown>;
  tool_result: McpCallToolResult;
  sandbox_url: string;
}

function appPath(ref: McpAppRef): string {
  const sid = encodeURIComponent(ref.sessionId);
  const appId = encodeURIComponent(ref.appInstanceId);
  const dataRef = encodeURIComponent(ref.dataRef);
  return `/v1/sessions/${sid}/mcp-apps/${appId}?data_ref=${dataRef}`;
}

function childPath(ref: McpAppRef, child: string): string {
  const base = appPath(ref);
  const [path, query] = base.split('?', 2);
  return `${path}/${child}?${query}`;
}

export function fetchMcpApp(client: HttpTransport, ref: McpAppRef): Promise<McpAppPayload> {
  return client.get<McpAppPayload>(appPath(ref));
}

export function callMcpAppTool(
  client: HttpTransport,
  ref: McpAppRef,
  body: { name: string; arguments?: Record<string, unknown> },
): Promise<McpCallToolResult> {
  return client.post<McpCallToolResult>(childPath(ref, 'tools/call'), body);
}

export function readMcpAppResource(
  client: HttpTransport,
  ref: McpAppRef,
  uri: string,
): Promise<McpReadResourceResult> {
  return client.post<McpReadResourceResult>(childPath(ref, 'resources/read'), { uri });
}

export function updateMcpAppModelContext(
  client: HttpTransport,
  ref: McpAppRef,
  context: Record<string, unknown>,
): Promise<Record<string, never>> {
  return client.put<Record<string, never>>(childPath(ref, 'model-context'), context);
}

export function postMcpAppMessage(
  client: HttpTransport,
  ref: McpAppRef,
  message: Record<string, unknown>,
): Promise<{ message_id: string }> {
  return client.post<{ message_id: string }>(childPath(ref, 'messages'), message);
}

export function closeMcpApp(client: HttpTransport, ref: McpAppRef): Promise<void> {
  return client.del<void>(appPath(ref));
}
