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
