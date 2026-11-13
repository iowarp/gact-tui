import { z } from 'zod';
import type {
  McpAppDescriptor,
  McpAppDisplayMode,
  McpAppIdentity,
  McpAppMessageAcknowledgement,
  McpAppPlacementState,
  McpAppSavedDownload,
} from './mcp-app-domain.js';
import { InteractionRepository } from './interaction-repository.js';
import { decodeMcpAppReopen, type McpAppReopenResult } from './mcp-app-reopen.js';

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
  display_mode: z.enum(['inline', 'fullscreen']).default('inline'),
  pinned: z.boolean().default(false),
});

const placementSchema = z.object({
  display_mode: z.enum(['inline', 'fullscreen']),
  pinned: z.boolean(),
});

const downloadSchema = z.object({
  files: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      artifact_id: z.string(),
      artifact_skipped: z.string().optional(),
    }),
  ),
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

  /** Whether CLIO still holds the view; a closed view is `false`, not an error. */
  public mcpAppLive(identity: McpAppIdentity, signal?: AbortSignal): Promise<boolean> {
    return this.transport.request({
      method: 'GET',
      path: appPath(identity, '/live'),
      decode: (value) => z.object({ live: z.boolean() }).parse(value).live,
      signal,
    });
  }

  /** Record where the App's one frame is (MA4); `fullscreen` pins the record (MA6). */
  public setMcpAppDisplayMode(
    identity: McpAppIdentity,
    mode: McpAppDisplayMode,
    signal?: AbortSignal,
  ): Promise<McpAppPlacementState> {
    return this.transport.request({
      method: 'PUT',
      path: appPath(identity, '/display-mode'),
      body: { mode },
      decode: (value) => placementSchema.parse(value),
      signal,
    });
  }

  /** Replay a view's saved opening call; a failed replay is a result, not a throw. */
  public reopenMcpApp(
    sessionId: string,
    appInstanceId: string,
    signal?: AbortSignal,
  ): Promise<McpAppReopenResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/mcp-apps/reopen`,
      body: { app_instance_id: appInstanceId },
      decode: decodeMcpAppReopen,
      signal,
    });
  }

  /** Pin or unpin an App mounted in an A2UI surface (MA5/MA6). */
  public pinMcpApp(
    identity: McpAppIdentity,
    pinned: boolean,
    signal?: AbortSignal,
  ): Promise<McpAppPlacementState> {
    return this.transport.request({
      method: 'PUT',
      path: appPath(identity, '/pin'),
      body: { pinned },
      decode: (value) => placementSchema.parse(value),
      signal,
    });
  }

  /** Save a view's `ui/download-file` contents into the session's workspace (MA16). */
  public saveMcpAppDownload(
    identity: McpAppIdentity,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ files: McpAppSavedDownload[] }> {
    return this.transport.request({
      method: 'POST',
      path: appPath(identity, '/downloads'),
      body: params,
      decode: (value) => downloadSchema.parse(value),
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
