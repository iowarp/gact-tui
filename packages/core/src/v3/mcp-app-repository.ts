import { z } from 'zod';
import type {
  McpAppDescriptor,
  McpAppIdentity,
  McpAppMessageAcknowledgement,
} from './mcp-app-domain.js';
import { InteractionRepository } from './interaction-repository.js';

const descriptorSchema = z.object({
  protocol_version: z.string(),
  resource: z.object({
    uri: z.string(),
    mime_type: z.string(),
    html: z.string(),
    csp: z.record(z.string(), z.unknown()).default({}),
    permissions: z.record(z.string(), z.unknown()).default({}),
  }),
  tool_input: z.record(z.string(), z.unknown()).default({}),
  tool_result: z.record(z.string(), z.unknown()).default({}),
  sandbox_url: z.string().url(),
});

const acknowledgementSchema = z.object({
  message_id: z.string(),
  delivery: z.string(),
  state: z.string(),
});

function appPath(identity: McpAppIdentity, suffix = ''): string {
  const session = encodeURIComponent(identity.sessionId);
  const app = encodeURIComponent(identity.appInstanceId);
  const dataRef = encodeURIComponent(identity.dataRef);
  return `/v1/sessions/${session}/mcp-apps/${app}${suffix}?data_ref=${dataRef}`;
}

/** Typed access to one server-owned MCP App capability. */
export class McpAppRepository extends InteractionRepository {
  public mcpAppDescriptor(
    identity: McpAppIdentity,
    signal?: AbortSignal,
  ): Promise<McpAppDescriptor> {
    return this.transport.request({
      method: 'GET',
      path: appPath(identity),
      decode: (value) => descriptorSchema.parse(value),
      signal,
    });
  }

  public callMcpAppTool(
    identity: McpAppIdentity,
    request: { name: string; arguments?: Record<string, unknown> },
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path: appPath(identity, '/tools/call'),
      body: request,
      decode: (value) => value,
      signal,
    });
  }

  public readMcpAppResource(
    identity: McpAppIdentity,
    uri: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path: appPath(identity, '/resources/read'),
      body: { uri },
      decode: (value) => value,
      signal,
    });
  }

  public updateMcpAppModelContext(
    identity: McpAppIdentity,
    context: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'PUT',
      path: appPath(identity, '/model-context'),
      body: context,
      decode: (value) => value,
      signal,
    });
  }

  public postMcpAppMessage(
    identity: McpAppIdentity,
    message: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<McpAppMessageAcknowledgement> {
    return this.transport.request({
      method: 'POST',
      path: appPath(identity, '/messages'),
      body: message,
      decode: (value) => acknowledgementSchema.parse(value),
      signal,
    });
  }

  public closeMcpApp(identity: McpAppIdentity, signal?: AbortSignal): Promise<unknown> {
    return this.transport.request({
      method: 'DELETE',
      path: appPath(identity),
      decode: (value) => value,
      signal,
    });
  }
}
