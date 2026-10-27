/**
 * One MCP server's preparation for a conversation, as the server listing reports it
 * beside the server's ``status`` (``preparing`` / ``failed``) and its typed ``reason``.
 */
export interface McpServerPreparation {
  state: 'preparing' | 'ready' | 'failed' | 'unknown';
  phase: 'provision' | 'launch' | 'connect' | 'unknown';
  /** Typed reason of a failure (or of a retry still in progress). */
  reason?: string;
  /** The failure's technical detail, such as the install command's output. */
  detail?: string;
  /** How the server's environment was prepared, as a typed outcome. */
  provision?: string;
  attempt?: number;
  tool_count?: number;
  elapsed_s?: number;
}
