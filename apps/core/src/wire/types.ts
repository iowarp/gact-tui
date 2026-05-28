/**
 * Wire types for the GACT v0.2 contract.
 * Authoritative source: contract/SPEC.md in the repository root.
 *
 * This is a subset sufficient for the harness — full coverage lands as
 * post-harness work tracked in apps/PLAN.md.
 */

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'waiting_permission'
  | 'error'
  | 'finished';

export interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  workspace_id?: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface Workspace {
  id: string;
  name: string;
  root_path: string;
}

export interface PartText {
  type: 'text';
  text: string;
}

export interface PartThinking {
  type: 'thinking';
  text: string;
}

export interface PartToolCall {
  type: 'tool_call';
  id: string;
  tool_name: string;
  input?: Record<string, unknown>;
}

export interface PartToolResult {
  type: 'tool_result';
  tool_call_id: string;
  output?: string;
  is_error?: boolean;
}

export interface FileDiff {
  type: 'file_diff';
  path: string;
  before?: string | null;
  after?: string | null;
  unified_diff?: string;
  language?: string | null;
  applied?: boolean;
}

export type Part = PartText | PartThinking | PartToolCall | PartToolResult | FileDiff;

export interface Message {
  id: string;
  role: Role;
  parts: Part[];
  created_at?: string;
}

export type PermissionScope = 'once' | 'session' | 'always_tool' | 'always_server';

export interface PermissionRequest {
  id: string;
  session_id: string;
  tool_name: string;
  tool_call?: {
    input?: Record<string, unknown>;
  };
  risk?: 'low' | 'medium' | 'high';
  reason?: string;
  created_at: string;
}

export interface Capabilities {
  contract_version: string;
  sessions: boolean;
  messages: boolean;
  sse: boolean;
  diffs: boolean;
  tools: boolean;
  permissions: boolean;
  agents: boolean;
  mcp: boolean;
  metrics: boolean;
  files?: boolean;
  memory?: boolean;
  agent_routing?: boolean;
  [k: string]: unknown;
}
