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
  /** The app's live service through CLIO's route (MA23), on the sandbox origin. */
  service_url?: string | null;
  /** Why CLIO does not carry a service the app's server declared. */
  service_refusal?: { reason: string; message: string } | null;
  /** Loopback CSP sources the view declared and CLIO refused. */
  csp_refused?: { directive: string; source: string; reason: string }[];
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
