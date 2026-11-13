import { z } from 'zod';
import type {
  McpAppDescriptor,
  McpAppIdentity,
  McpAppMessageAcknowledgement,
  McpAppToolsAcknowledgement,
  McpAppViewTool,
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

const appToolsAcknowledgementSchema = z.object({
  offered: z.array(z.string()).default([]),
  reason: z.string().optional(),
  message: z.string().optional(),
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

  /** What the view offers now (MA11); an empty list withdraws its tools. */
  public updateMcpAppTools(
    identity: McpAppIdentity,
    tools: McpAppViewTool[],
    holder?: string,
    signal?: AbortSignal,
  ): Promise<McpAppToolsAcknowledgement> {
    return this.transport.request({
      method: 'PUT',
      path: appPath(identity, '/app-tools'),
      body: holder ? { tools, holder } : { tools },
      decode: (value) => appToolsAcknowledgementSchema.parse(value),
      signal,
    });
  }

  /** The view's answer to one agent call of its tool (MA13). */
  public postMcpAppToolResult(
    identity: McpAppIdentity,
    callId: string,
    answer: { result: Record<string, unknown> } | { error: { message: string } },
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path: appPath(identity, `/app-tool-results/${encodeURIComponent(callId)}`),
      body: answer,
      decode: (value) => value,
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
