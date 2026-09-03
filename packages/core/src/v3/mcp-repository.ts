import { z } from 'zod';
import type { McpServerDefinition } from './domain.js';
import { DocumentRepository } from './document-repository.js';
import { mcpServerListSchema } from './repository-decoders.js';
import { mcpServerDefinitionSchema } from './schemas.js';

/** Tool-provider discovery, lifecycle, and inventory routes. */
export class McpRepository extends DocumentRepository {
  public async mcpServers(
    workspaceId?: string,
    signal?: AbortSignal,
    sessionId?: string,
  ): Promise<McpServerDefinition[]> {
    const params = [
      workspaceId ? `workspace_id=${encodeURIComponent(workspaceId)}` : '',
      sessionId ? `session_id=${encodeURIComponent(sessionId)}` : '',
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
