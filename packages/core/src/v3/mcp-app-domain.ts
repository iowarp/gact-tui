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

/** A view opened from a call, outside the transcript (an A2UI surface, a reopen). */
export interface McpAppOpened {
  part: {
    type: 'mcp_app';
    app_instance_id: string;
    data_ref: string;
    resource_uri: string;
    source_server: string;
    tool_name: string;
  };
  saved_call: McpAppCall;
  /** The server's tools the view may call, without the server's prefix. */
  server_tools: string[];
}

/** Why a call could not open its view, with the call so the person can retry. */
export interface McpAppOpenFailure {
  error: { reason: string; detail: string };
  saved_call: McpAppCall;
}
