import { z } from 'zod';

/**
 * The call that opened an MCP App view, saved with the session (plan MA18).
 * The private result and the view's HTML are never part of it.
 */
export interface McpAppSavedCall {
  server: string;
  tool: string;
  arguments: Record<string, unknown> | null;
  display_mode: 'inline' | 'fullscreen';
  resource_uri: string;
  label: string;
  saved_at?: string;
  reopened_from?: string;
  unsaved_reason?: string;
}

/** The fresh view a replayed call opened (plan MA19). */
export interface McpAppReopenedView {
  appInstanceId: string;
  dataRef: string;
  resourceUri: string;
  sourceServer: string;
  toolName: string;
  displayMode: 'inline' | 'fullscreen';
}

export type McpAppReopenResult =
  | { ok: true; view: McpAppReopenedView; savedCall: McpAppSavedCall | null }
  | { ok: false; reason: string; detail: string; savedCall: McpAppSavedCall | null };

/** Reasons a replay may simply be tried again; the others need a change first. */
export const MCP_APP_RETRYABLE_REOPEN_REASONS: ReadonlySet<string> = new Set([
  'tool_unavailable',
  'permission_denied',
  'call_failed',
  'tool_error',
  'view_not_opened',
]);

const displayModeSchema = z.enum(['inline', 'fullscreen']).catch('inline');

const savedCallSchema = z
  .object({
    server: z.string(),
    tool: z.string(),
    arguments: z.record(z.string(), z.unknown()).nullable().default(null),
    display_mode: displayModeSchema.default('inline'),
    resource_uri: z.string().default(''),
    label: z.string().default(''),
    saved_at: z.string().optional(),
    reopened_from: z.string().optional(),
    unsaved_reason: z.string().optional(),
  })
  .passthrough();

const reopenResponseSchema = z.union([
  z.object({
    part: z
      .object({
        app_instance_id: z.string(),
        data_ref: z.string(),
        resource_uri: z.string(),
        source_server: z.string(),
        tool_name: z.string().default(''),
        metadata: z.object({ display_mode: displayModeSchema.optional() }).passthrough().default({}),
      })
      .passthrough(),
    saved_call: savedCallSchema.nullable().default(null),
  }),
  z.object({
    error: z.object({ reason: z.string(), detail: z.string().default('') }),
    saved_call: savedCallSchema.nullable().default(null),
  }),
]);

/** Decode `POST /v1/sessions/{sid}/mcp-apps/reopen`. */
export function decodeMcpAppReopen(value: unknown): McpAppReopenResult {
  const parsed = reopenResponseSchema.parse(value);
  const savedCall = (parsed.saved_call as McpAppSavedCall | null) ?? null;
  if ('error' in parsed) {
    return { ok: false, reason: parsed.error.reason, detail: parsed.error.detail, savedCall };
  }
  const part = parsed.part;
  return {
    ok: true,
    savedCall,
    view: {
      appInstanceId: part.app_instance_id,
      dataRef: part.data_ref,
      resourceUri: part.resource_uri,
      sourceServer: part.source_server,
      toolName: part.tool_name,
      displayMode: part.metadata.display_mode ?? savedCall?.display_mode ?? 'inline',
    },
  };
}

/** Saved calls in a session's metadata (`mcp_app_calls`), keyed by app instance. */
export function savedMcpAppCalls(
  metadata: Record<string, unknown> | undefined,
): Record<string, McpAppSavedCall> {
  const raw = metadata?.mcp_app_calls;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const calls: Record<string, McpAppSavedCall> = {};
  for (const [key, value] of Object.entries(raw)) {
    const parsed = savedCallSchema.safeParse(value);
    if (parsed.success) calls[key] = parsed.data as McpAppSavedCall;
  }
  return calls;
}
