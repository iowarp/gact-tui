import { z } from 'zod';
import type { McpServerDefinition, McpUserConfiguration } from './domain.js';
import { DocumentRepository } from './document-repository.js';
import { mcpServerListSchema } from './repository-decoders.js';
import { mcpServerDefinitionSchema, mcpServerPreparationSchema } from './schemas.js';

const mcpUserConfigurationSchema = z.object({
  name: z.string(),
  configured: z.boolean(),
  scope: z.literal('user'),
  status: z.enum(['ready', 'degraded', 'auth_required', 'local_fallback']),
  transport: z.string().optional(),
  tools_count: z.number().int().nonnegative().default(0),
  tools: z.array(z.string()).default([]),
  tool_details: z.array(z.record(z.string(), z.unknown())).default([]),
  spec: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  retryable: z.boolean(),
  removed: z.boolean().optional(),
});

export type McpConfigurationInput =
  | {
      transport: 'http' | 'sse';
      url: string;
      always_load?: boolean;
      connection_only?: boolean;
      name?: string;
      authentication?: 'auto' | 'none' | 'oauth';
      headers?: Record<string, string>;
    }
  | {
      transport: 'stdio';
      command: string;
      args: string[];
      env?: Record<string, string>;
      always_load?: boolean;
      connection_only?: boolean;
      name?: string;
    };

const savedMcpServiceSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  transport: z.string(),
  always_load: z.boolean(),
  spec: z.record(z.string(), z.unknown()).default({}),
});

/** A service the person saved (Settings or `clio-agent mcp add`), not yet started. */
export type SavedMcpService = z.infer<typeof savedMcpServiceSchema>;

export const mcpSignInSchema = z.object({
  flow_id: z.string(),
  name: z.string(),
  expires_at: z.number(),
  state: z.enum([
    'preparing',
    'authorizing',
    'connecting',
    'connected',
    'cancelled',
    'denied',
    'expired',
    'failed',
  ]),
  authorization_url: z.string().default(''),
  error: z.string().default(''),
  tools: z.array(z.string()).default([]),
});
export type McpSignIn = z.infer<typeof mcpSignInSchema>;
export interface McpSignInInput {
  redirect_uri: string;
  client_id?: string;
  client_secret?: string;
  client_metadata_url?: string;
}

const mcpSessionServerReconnectSchema = z.object({
  session_id: z.string(),
  namespace: z.string(),
  state: z.string(),
  preparation: mcpServerPreparationSchema.nullable().optional(),
});
/** The immediate answer to a conversation server reconnect. */
export type McpSessionServerReconnect = z.infer<typeof mcpSessionServerReconnectSchema>;

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
  /** Start an explicit user sign-in; credentials never enter conversation messages. */
  public startMcpSignIn(
    name: string,
    body: McpSignInInput,
    signal?: AbortSignal,
  ): Promise<McpSignIn> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}/sign-in`,
      body,
      decode: (value) => mcpSignInSchema.parse(value),
      signal,
    });
  }
  public mcpSignIn(name: string, id: string, signal?: AbortSignal): Promise<McpSignIn> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}/sign-in/${encodeURIComponent(id)}`,
      decode: (value) => mcpSignInSchema.parse(value),
      signal,
    });
  }
  public completeMcpSignIn(
    name: string,
    id: string,
    callbackUrl: string,
    signal?: AbortSignal,
  ): Promise<McpSignIn> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}/sign-in/${encodeURIComponent(id)}/complete`,
      body: { callback_url: callbackUrl },
      decode: (value) => mcpSignInSchema.parse(value),
      signal,
    });
  }
  public cancelMcpSignIn(name: string, id: string, signal?: AbortSignal): Promise<McpSignIn> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}/sign-in/${encodeURIComponent(id)}`,
      decode: (value) => mcpSignInSchema.parse(value),
      signal,
    });
  }
  public forgetMcpAuthorization(
    name: string,
    signal?: AbortSignal,
  ): Promise<{ name: string; state: 'signed_out' }> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}/authorization`,
      decode: (value) =>
        z.object({ name: z.string(), state: z.literal('signed_out') }).parse(value),
      signal,
    });
  }
  /** Prepare the selected workspace's MCP fleet without creating a session. */
  public warmWorkspace(workspaceId: string, signal?: AbortSignal) {
    return this.transport.request({
      method: 'POST',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/warmup`,
      decode: (value) =>
        z.object({ status: z.enum(['warming', 'disabled', 'unavailable']) }).parse(value),
      signal,
    });
  }

  public mcpConfiguration(name: string, signal?: AbortSignal): Promise<McpUserConfiguration> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/mcp/configuration/${encodeURIComponent(name)}`,
      decode: (value) => mcpUserConfigurationSchema.parse(value),
      signal,
    });
  }

  public savedMcpServices(signal?: AbortSignal): Promise<SavedMcpService[]> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/mcp/configuration',
      decode: (value) => z.object({ servers: z.array(savedMcpServiceSchema) }).parse(value).servers,
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

  public removeMcpConfiguration(name: string, signal?: AbortSignal): Promise<McpUserConfiguration> {
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

  public reconnectMcpServer(serverId: string, signal?: AbortSignal): Promise<McpServerDefinition> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/mcp/servers/${encodeURIComponent(serverId)}/reconnect`,
      decode: (value) => mcpServerDefinitionSchema.parse(value),
      signal,
    });
  }

  /**
   * Prepare one of a conversation's MCP servers again: its current connection stops, a
   * failure is cleared, and it is provisioned, started and listed in the background.
   * The answer is immediate; the server listing then shows its progress.
   */
  public reconnectSessionMcpServer(
    sessionId: string,
    namespace: string,
    signal?: AbortSignal,
  ): Promise<McpSessionServerReconnect> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/mcp/${encodeURIComponent(namespace)}/reconnect`,
      decode: (value) => mcpSessionServerReconnectSchema.parse(value),
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
