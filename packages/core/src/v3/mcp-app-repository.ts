import { z } from 'zod';
import type {
  McpAppCall,
  McpAppDescriptor,
  McpAppIdentity,
  McpAppMessageAcknowledgement,
  McpAppOpened,
  McpAppOpenFailure,
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

const callSchema = z.object({
  server: z.string(),
  tool: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

const openOutcomeSchema = z.union([
  z.object({
    part: z.object({
      type: z.literal('mcp_app'),
      app_instance_id: z.string().min(1),
      data_ref: z.string().min(1),
      resource_uri: z.string(),
      source_server: z.string(),
      tool_name: z.string(),
    }),
    saved_call: callSchema,
    server_tools: z.array(z.string()).default([]),
  }),
  z.object({
    error: z.object({ reason: z.string(), detail: z.string() }),
    saved_call: callSchema,
  }),
]);

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

  /** Make a call that opens a view and admit the view without adding it to the transcript. */
  public openMcpAppFromCall(
    sessionId: string,
    call: McpAppCall,
    signal?: AbortSignal,
  ): Promise<McpAppOpened | McpAppOpenFailure> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/mcp-apps/open`,
      body: call,
      decode: (value) => openOutcomeSchema.parse(value) as McpAppOpened | McpAppOpenFailure,
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
