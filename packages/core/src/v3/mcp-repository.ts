import { z } from 'zod';
import type { McpServerDefinition, McpUserConfiguration } from './domain.js';
import { DocumentRepository } from './document-repository.js';
import { mcpServerListSchema } from './repository-decoders.js';
import { mcpServerDefinitionSchema } from './schemas.js';

const mcpUserConfigurationSchema = z.object({
  name: z.string(),
  configured: z.boolean(),
  scope: z.literal('user'),
  status: z.enum(['ready', 'degraded', 'local_fallback']),
  transport: z.string().optional(),
  tools_count: z.number().int().nonnegative().default(0),
  tools: z.array(z.string()).default([]),
  spec: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  retryable: z.boolean(),
  removed: z.boolean().optional(),
});

export type McpConfigurationInput =
  | { transport: 'http'; url: string; name?: string }
  | {
      transport: 'stdio';
      command: string;
      args: string[];
      env?: Record<string, string>;
      name?: string;
    };

/** Narrows an MCP server listing to the tools one session holds open. */
export interface McpServerListOptions {
  /**
   * Restricts the listing to the servers this session owns, alongside the
   * shared ones. A service that predates the parameter ignores it and answers
   * with the shared inventory, which is why the caller must check whether the
   * answer carries `session_id` at all rather than assume it was honoured.
   */
  sessionId?: string;
}

/** Tool-provider discovery, lifecycle, and inventory routes. */
export class McpRepository extends DocumentRepository {
  public mcpConfiguration(
    name: string,
    signal?: AbortSignal,
  ): Promise<McpUserConfiguration> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}`,
      decode: (value) => mcpUserConfigurationSchema.parse(value),
      signal,
    });
  }

  public configureMcpServer(
    name: string,
    input: McpConfigurationInput,
    signal?: AbortSignal,
  ): Promise<McpUserConfiguration> {
    return this.transport.request({
      method: 'PUT',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}`,
      body: input,
      decode: (value) => mcpUserConfigurationSchema.parse(value),
      signal,
    });
  }

  public removeMcpConfiguration(
    name: string,
    signal?: AbortSignal,
  ): Promise<McpUserConfiguration> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}`,
      decode: (value) => mcpUserConfigurationSchema.parse(value),
      signal,
    });
  }

  public async mcpServers(
    workspaceId?: string,
    signal?: AbortSignal,
    options: McpServerListOptions = {},
  ): Promise<McpServerDefinition[]> {
    const params = [
      workspaceId ? `workspace_id=${encodeURIComponent(workspaceId)}` : '',
      options.sessionId ? `session_id=${encodeURIComponent(options.sessionId)}` : '',
    ].filter(Boolean);
    const query = params.length ? `?${params.join('&')}` : '';
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/mcp/servers${query}`,
      decode: (value) => mcpServerListSchema.parse(value),
      signal,
    });
    return result.servers as McpServerDefinition[];
  }

  public mcpServer(serverId: string, signal?: AbortSignal): Promise<McpServerDefinition> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/mcp/servers/${encodeURIComponent(serverId)}`,
      decode: (value) => mcpServerDefinitionSchema.parse(value),
      signal,
    });
  }

  public installMcpServer(
    input:
      | { name: string; transport: 'http'; url: string }
      | {
          name: string;
          transport: 'stdio';
          command: string;
          args: string[];
          env?: Record<string, string>;
        },
    signal?: AbortSignal,
  ): Promise<McpServerDefinition> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/mcp/servers',
      body: input,
      decode: (value) => mcpServerDefinitionSchema.parse(value),
      signal,
    });
  }

  public reconnectMcpServer(serverId: string, signal?: AbortSignal): Promise<McpServerDefinition> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/mcp/servers/${encodeURIComponent(serverId)}/reconnect`,
      decode: (value) => mcpServerDefinitionSchema.parse(value),
      signal,
    });
  }

  public deleteMcpServer(serverId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/mcp/servers/${encodeURIComponent(serverId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public mcpServerInventory(
    serverId: string,
    kind: 'tools' | 'resources' | 'prompts',
    signal?: AbortSignal,
  ): Promise<Array<Record<string, unknown>>> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/mcp/servers/${encodeURIComponent(serverId)}/${kind}`,
      decode: (value) => {
        const envelope = z.record(z.string(), z.unknown()).parse(value);
        return z.array(z.record(z.string(), z.unknown())).parse(envelope[kind] ?? []);
      },
      signal,
    });
  }
}
