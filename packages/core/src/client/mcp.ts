import type { HttpTransport } from './transport.js';
import type {
  CallMcpToolInput,
  CallMcpToolResult,
  InstallMcpServerInput,
  InstallMcpServerResult,
  McpGetPromptResult,
  McpPromptArgs,
  McpPromptList,
  McpReadResourceResult,
  McpResourceList,
  McpResourceTemplateList,
  McpServersResult,
  McpServerToolList,
  ReconnectMcpServerResult,
} from './mcp_types.js';

export * from './mcp_types.js';

type McpTransport = Pick<HttpTransport, 'get' | 'post' | 'request'>;

export function fetchMcpServers(client: McpTransport): Promise<McpServersResult> {
  return client.get<McpServersResult>('/v1/mcp/servers');
}

export function registerMcpServer(
  client: McpTransport,
  body: InstallMcpServerInput,
): Promise<InstallMcpServerResult> {
  return client.post<InstallMcpServerResult>('/v1/mcp/servers', body);
}

export function removeMcpServer(
  client: McpTransport,
  serverId: string,
): Promise<void> {
  return client.request<void>(
    `/v1/mcp/servers/${encodeURIComponent(serverId)}`,
    'DELETE',
    undefined,
  );
}

export function reconnectMcp(
  client: McpTransport,
  serverId: string,
): Promise<ReconnectMcpServerResult> {
  return client.post<ReconnectMcpServerResult>(
    `/v1/mcp/servers/${encodeURIComponent(serverId)}/reconnect`,
    {},
  );
}

export function fetchMcpServerTools(
  client: McpTransport,
  serverId: string,
): Promise<McpServerToolList> {
  return client.get(`/v1/mcp/servers/${encodeURIComponent(serverId)}/tools`);
}

export function fetchMcpServerResources(
  client: McpTransport,
  serverId: string,
): Promise<McpResourceList> {
  return client.get(`/v1/mcp/servers/${encodeURIComponent(serverId)}/resources`);
}

export function fetchMcpServerPrompts(
  client: McpTransport,
  serverId: string,
): Promise<McpPromptList> {
  return client.get(`/v1/mcp/servers/${encodeURIComponent(serverId)}/prompts`);
}

export function readMcpResource(
  client: McpTransport,
  serverId: string,
  uri: string,
): Promise<McpReadResourceResult> {
  return client.post(
    `/v1/mcp/servers/${encodeURIComponent(serverId)}/resources/read`,
    { uri },
  );
}

export function subscribeMcpResource(
  client: McpTransport,
  serverId: string,
  uri: string,
): Promise<void> {
  return client.post(
    `/v1/mcp/servers/${encodeURIComponent(serverId)}/resources/subscribe`,
    { uri },
  );
}

export function unsubscribeMcpResource(
  client: McpTransport,
  serverId: string,
  uri: string,
): Promise<void> {
  return client.request(
    `/v1/mcp/servers/${encodeURIComponent(serverId)}/resources/subscribe`,
    'DELETE',
    { uri },
  );
}

export function fetchMcpResourceTemplates(
  client: McpTransport,
  serverId: string,
): Promise<McpResourceTemplateList> {
  return client.get(
    `/v1/mcp/servers/${encodeURIComponent(serverId)}/resource_templates`,
  );
}

export function getMcpPrompt(
  client: McpTransport,
  serverId: string,
  name: string,
  args: McpPromptArgs = {},
): Promise<McpGetPromptResult> {
  return client.post(
    `/v1/mcp/servers/${encodeURIComponent(serverId)}/prompts/get`,
    { name, arguments: args },
  );
}

export function invokeMcpTool(
  client: McpTransport,
  serverId: string,
  body: CallMcpToolInput,
): Promise<CallMcpToolResult> {
  const payload: Record<string, unknown> = {
    tool: body.tool,
    args: body.args ?? {},
  };
  if (body.sessionId) payload.session_id = body.sessionId;
  return client.post(
    `/v1/mcp/servers/${encodeURIComponent(serverId)}/call`,
    payload,
  );
}
