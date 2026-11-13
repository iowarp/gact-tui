import type { McpAppReopenResult } from './mcp-app-reopen.js';

/** Where an App's one frame is: the card (`inline`) or a workbench tab (`fullscreen`). */
export type McpAppDisplayMode = 'inline' | 'fullscreen';

/** Public descriptor used to host one server-owned MCP App instance. */
export interface McpAppDescriptor {
  protocol_version: string;
  resource: {
    uri: string;
    mime_type: string;
    html: string;
    csp: Record<string, unknown>;
    permissions: Record<string, unknown>;
  };
  tool_input: Record<string, unknown>;
  tool_result: Record<string, unknown>;
  sandbox_url: string;
  /** The record's current mode (MA4); a reloaded UI restores the tab from it. */
  display_mode: McpAppDisplayMode;
  /** Pinned by a tab or an A2UI surface: neither expired nor counted (MA6). */
  pinned: boolean;
  /** The app's live service through CLIO's route (MA23), on the sandbox origin. */
  service_url?: string | null;
  /** Why CLIO does not carry a service the app's server declared. */
  service_refusal?: { reason: string; message: string } | null;
  /** Loopback CSP sources the view declared and CLIO refused. */
  csp_refused?: { directive: string; source: string; reason: string }[];
}

/** The record's mode and pin after `PUT …/display-mode` or `PUT …/pin`. */
export interface McpAppPlacementState {
  display_mode: McpAppDisplayMode;
  pinned: boolean;
}

/** One file a view's `ui/download-file` saved into the session's workspace (MA16). */
export interface McpAppSavedDownload {
  name: string;
  /** Workspace-relative path. */
  path: string;
  /** Empty when the file was saved but could not be registered as an artifact. */
  artifact_id: string;
  artifact_skipped?: string;
}

export interface McpAppIdentity {
  sessionId: string;
  appInstanceId: string;
  dataRef: string;
}

export interface McpAppMessageAcknowledgement {
  message_id: string;
  delivery: string;
  state: string;
}

/** One tool a view lists over `tools/list` (draft "App-Provided Tools"). */
export interface McpAppViewTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface McpAppToolsAcknowledgement {
  offered: string[];
  reason?: string;
  message?: string;
}

/** The session event asking the surface holding an app to run one of its view's tools. */
export interface McpAppToolCallEvent {
  session_id: string;
  app_instance_id: string;
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** A call that opens an MCP App: a server, one of its tools and the arguments. */
export interface McpAppCall {
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
}

/** A view opened from a call (the reopen answer), with the server tools the view may call. */
export type McpAppOpenFromCallResult = McpAppReopenResult & { serverTools: string[] };
