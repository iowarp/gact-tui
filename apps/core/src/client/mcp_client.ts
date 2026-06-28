import {
  fetchMcpResourceTemplates,
  fetchMcpServerPrompts,
  fetchMcpServerResources,
  fetchMcpServers,
  fetchMcpServerTools,
  getMcpPrompt,
  invokeMcpTool,
  readMcpResource,
  reconnectMcp,
  registerMcpServer,
  removeMcpServer,
  subscribeMcpResource,
  unsubscribeMcpResource,
} from './mcp.js';
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
} from './mcp.js';
import { HttpTransport } from './transport.js';

export class McpClient extends HttpTransport {
  mcpServers(): Promise<McpServersResult> {
    return fetchMcpServers(this);
  }

  /**
   * POST /v1/mcp/servers — register a new MCP server. Transport-shaped:
   * `{name, transport: 'stdio', command, args?, env?}` or
   * `{name, transport: 'sse' | 'http', url}`. Returns the new server.
   */
  installMcpServer(body: InstallMcpServerInput): Promise<InstallMcpServerResult> {
    return registerMcpServer(this, body);
  }

  /** DELETE /v1/mcp/servers/{id} — uninstall an MCP server. */
  uninstallMcpServer(serverId: string): Promise<void> {
    return removeMcpServer(this, serverId);
  }

  /** POST /v1/mcp/servers/{id}/reconnect — force a reconnect attempt. */
  reconnectMcpServer(serverId: string): Promise<ReconnectMcpServerResult> {
    return reconnectMcp(this, serverId);
  }

  /**
   * GET /v1/mcp/servers/{id}/tools — list the tools exposed by an MCP
   * server. Used by the per-server detail view.
   */
  mcpServerTools(serverId: string): Promise<McpServerToolList> {
    return fetchMcpServerTools(this, serverId);
  }

  /** GET /v1/mcp/servers/{id}/resources — list MCP resources. */
  mcpServerResources(serverId: string): Promise<McpResourceList> {
    return fetchMcpServerResources(this, serverId);
  }

  /** GET /v1/mcp/servers/{id}/prompts — list MCP prompt templates. */
  mcpServerPrompts(serverId: string): Promise<McpPromptList> {
    return fetchMcpServerPrompts(this, serverId);
  }

  /**
   * POST /v1/mcp/servers/{id}/resources/read — fetch an MCP resource
   * by URI. Used for inspecting what an MCP server exposes.
   */
  mcpReadResource(serverId: string, uri: string): Promise<McpReadResourceResult> {
    return readMcpResource(this, serverId, uri);
  }

  /** POST /v1/mcp/servers/{id}/resources/subscribe — subscribe to
   * resource-changed events for `uri`. */
  mcpSubscribeResource(serverId: string, uri: string): Promise<void> {
    return subscribeMcpResource(this, serverId, uri);
  }

  /** DELETE /v1/mcp/servers/{id}/resources/subscribe — unsubscribe. */
  mcpUnsubscribeResource(serverId: string, uri: string): Promise<void> {
    return unsubscribeMcpResource(this, serverId, uri);
  }

  /** GET /v1/mcp/servers/{id}/resource_templates — list templated
   * resources (parameterized URIs). */
  mcpServerResourceTemplates(serverId: string): Promise<McpResourceTemplateList> {
    return fetchMcpResourceTemplates(this, serverId);
  }

  /** POST /v1/mcp/servers/{id}/prompts/get — fetch a prompt template
   * with arguments substituted. */
  mcpGetPrompt(
    serverId: string,
    name: string,
    args: McpPromptArgs = {},
  ): Promise<McpGetPromptResult> {
    return getMcpPrompt(this, serverId, name, args);
  }

  /**
   * POST /v1/mcp/servers/{id}/call — invoke a tool on an installed MCP
   * server. Body: {tool, args, session_id?}. Returns the tool's
   * structured result (mirrors fastmcp's CallToolResult shape).
   *
   * Passing `sessionId` attaches the call to a session context so the
   * regular tool_observer fires `tool.call.*` SSE events and ledger
   * entries identical to in-process tool calls.
   */
  callMcpTool(serverId: string, body: CallMcpToolInput): Promise<CallMcpToolResult> {
    return invokeMcpTool(this, serverId, body);
  }
}
