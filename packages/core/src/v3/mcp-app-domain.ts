import type { McpAppReopenResult } from './mcp-app-reopen.js';

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

/** A call that opens an MCP App: a server, one of its tools and the arguments. */
export interface McpAppCall {
  server: string;
  tool: string;
  arguments: Record<string, unknown>;
}

/** A view opened from a call (the reopen answer), with the server tools the view may call. */
export type McpAppOpenFromCallResult = McpAppReopenResult & { serverTools: string[] };
