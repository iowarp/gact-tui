import type { ProviderState } from './provider-domain.js';
import type { A2UI_VERSION } from './protocol-versions.js';

export type WireValue<Value extends string> = Value | 'unknown';
export type ConnectionKind = 'local' | 'remote' | 'ssh';
export type ConnectionHealth = 'connecting' | 'healthy' | 'degraded' | 'offline';
export type StreamState = 'connecting' | 'live' | 'reconnecting' | 'gapped' | 'offline';

export interface TransportGap {
  cursor: string;
  event_name: string;
  entity_id?: string;
  code: 'frame_decode_failed' | 'event_name_mismatch';
  reason: string;
  received_at: string;
}
export type RunState =
  | 'queued'
  | 'running'
  | 'waiting_permission'
  | 'waiting_user'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'unknown';
export type ToolState = WireValue<
  'pending' | 'running' | 'succeeded' | 'failed' | 'denied' | 'cancelled'
>;
export type A2UIState =
  | 'creating'
  | 'ready'
  | 'updating'
  | 'pending_action'
  | 'failed'
  | 'cancelled'
  | 'disconnected'
  | 'deleted'
  | 'unknown';

export interface Degradation {
  code: string;
  reason: string;
  capability?: string;
  recoverable: boolean;
}

export interface Provenance {
  source: WireValue<'server' | 'provider' | 'connection' | 'unavailable'>;
  observed_at: string;
  stale: boolean;
  reason?: string;
}

export interface Connection {
  id: string;
  name: string;
  endpoint: string;
  kind: ConnectionKind;
  health: ConnectionHealth;
  degradations: Degradation[];
}

export interface Workspace {
  id: string;
  name: string;
  display_name: string;
  path: string;
  connection_id: string;
  pinned: boolean;
  source_folders?: WorkspaceSourceFolder[];
}

export interface WorkspaceSourceFolder {
  path: string;
  name: string;
  primary: boolean;
}

export interface Session {
  id: string;
  workspace_id: string;
  title: string;
  state: RunState;
  created_at: string;
  updated_at: string;
  last_interaction_at?: string;
  provider_id?: string;
  model_id?: string;
  effort?: string;
  branch?: string;
  parent_session_id?: string;
  agent_id?: string;
  active_blueprint_id?: string;
  active_blueprint_name?: string;
  active_blueprint_version?: string;
  active_blueprint_scope?: string;
  mode: WireValue<'plan' | 'edit' | 'architect'>;
  edit_mode: WireValue<'diff' | 'whole' | 'patch'>;
  routing_mode: WireValue<'auto' | 'chat' | 'experts' | 'reasoning_only'>;
  approval_mode: WireValue<'ask' | 'auto-edits' | 'bypass' | 'ai-review' | 'spotter-ai'>;
  pinned: boolean;
  archived: boolean;
}

export interface SessionDefaults {
  provider_id: string;
  model_id: string;
  effort: WireValue<'off' | 'low' | 'medium' | 'high'>;
  mode: WireValue<'plan' | 'edit' | 'architect'>;
  edit_mode: WireValue<'diff' | 'whole' | 'patch'>;
  routing_mode: WireValue<'auto' | 'chat' | 'experts' | 'reasoning_only'>;
  approval_mode: WireValue<'ask' | 'auto-edits' | 'bypass' | 'ai-review' | 'spotter-ai'>;
  blueprint_id: string;
}

/** A server-owned instruction that will be submitted to one session at a future time. */
export interface ScheduledTurn {
  id: string;
  session_id: string;
  question: string;
  enabled: boolean;
  created_at: string;
  cron: string;
  timezone: string;
  recurring: boolean;
  run_at: string;
  next_fire_at: string;
  last_fired_at: string;
  fire_count: number;
  max_fires: number;
  until: string;
  overlap_policy: WireValue<'queue' | 'skip'>;
  retry_count: number;
  last_error: string;
  disabled_reason: string;
}

export interface ScheduledTurns {
  schedules: ScheduledTurn[];
  timezone: string;
}

export interface CreateScheduledTurnInput {
  question: string;
  cron?: string;
  run_at?: string;
  delay_s?: number;
  recurring?: boolean;
  timezone?: string;
  max_fires?: number;
  until?: string;
  overlap_policy?: 'queue' | 'skip';
}

export interface Run {
  id: string;
  session_id: string;
  state: RunState;
  started_at?: string;
  completed_at?: string;
  elapsed_ms?: number;
  summary?: string;
}

/** An authoritative attempt to regenerate a response from an earlier assistant turn. */
export interface TurnAttempt {
  id: string;
  session_id: string;
  source_message_id: string;
  status: WireValue<'recorded' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'>;
  created_at: string;
  updated_at: string;
  notes?: string;
  model?: { provider_id?: string; model_id?: string };
  warning?: string;
  metadata?: Record<string, unknown>;
}

/** A reconnectable execution handle projected by the authoritative runs registry. */
export interface OperationalRun {
  handle_id: string;
  task_id: string;
  run_label: string;
  live_state: RunState;
  status: string;
  protocol_status?: string;
  status_reason?: string;
  host: string;
  placement: string;
  parent_session_id: string;
  child_session_id?: string;
  created_at: string;
  updated_at: string;
  detached: boolean;
  source: WireValue<'agent_task' | 'mcp_task' | 'relay_job'>;
  ticker: {
    state: RunState;
    updated_at: string;
    path?: string;
  };
}

export interface ToolInvocation {
  id: string;
  session_id: string;
  run_id?: string;
  name: string;
  title?: string;
  state: ToolState;
  input?: unknown;
  output?: unknown;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  error?: string;
}

export interface ApprovalRequest {
  id: string;
  session_id: string;
  run_id?: string;
  tool_name: string;
  input?: unknown;
  summary: string;
  reason?: string;
  risk?: WireValue<'low' | 'medium' | 'high'>;
  status: WireValue<'pending' | 'approved' | 'denied' | 'cancelled'>;
  action?: WireValue<'allow' | 'deny' | 'allow_session' | 'allow_workspace'>;
  created_at: string;
  resolved_at?: string;
}

export interface UserQuestion {
  id: string;
  session_id: string;
  prompt: string;
  status: WireValue<'pending' | 'answered' | 'cancelled' | 'expired'>;
  kind: WireValue<'freeform' | 'choice' | 'confirmation'>;
  options?: Array<{ label: string; value: string; description?: string }>;
  answer?: string;
  selected_options?: string[];
  created_at: string;
  updated_at: string;
  expires_at?: string;
}

export interface Task {
  id: string;
  session_id: string;
  title: string;
  state: RunState;
  detail?: string;
}

export interface SubagentRun {
  id: string;
  session_id: string;
  parent_run_id?: string;
  child_session_id?: string;
  agent_id?: string;
  title: string;
  state: RunState;
  summary?: string;
  task?: string;
  result?: string;
  duration_ms?: number;
}

export interface Artifact {
  id: string;
  session_id: string;
  workspace_id?: string;
  name: string;
  media_type: string;
  uri: string;
  fetch_path?: string;
  custody?: string;
  sha256?: string;
  size?: number;
  created_at?: string;
  session_relation?: 'produced' | 'used';
}

export interface ArtifactVersion {
  artifact_id: string;
  workspace_id: string;
  name: string;
  version: number;
  kind: string;
  custody: string;
  mechanism: string;
  evidence_class: string;
  sha256?: string;
  size_bytes?: number;
  authority?: string;
  path?: string;
  created_at: string;
  annotation?: string;
  producer: Record<string, unknown>;
  prior_version?: number;
  prior_sha256?: string;
  kind_warning?: string;
  custody_gap?: boolean | Record<string, unknown>;
  uri: string;
  fetch_url: string;
}

export interface ArtifactRecord {
  workspace_id: string;
  name: string;
  kind: string;
  latest_version: number;
  head_artifact_id: string;
  aliases: Record<string, number>;
  versions: ArtifactVersion[];
  producing_session_ids?: string[];
}

export interface SessionArtifactListing {
  artifacts: ArtifactRecord[];
  used: ArtifactRecord[];
  count: number;
  include_children: boolean;
  child_session_ids: string[];
  truncated?: 'page_cap_reached' | 'cursor_cycle_detected';
}

export interface ArtifactDetail {
  artifact: ArtifactRecord;
  resolved: ArtifactVersion;
}

export interface ArtifactLineageNode {
  id: string;
  type: 'artifact' | 'activity' | 'gap';
  [key: string]: unknown;
}

export interface ArtifactLineageEdge {
  from: string;
  to: string;
  type: 'used' | 'generated' | 'revision_of';
  evidence: string;
}

export interface ArtifactLineage {
  root: string;
  direction: 'upstream' | 'downstream' | 'both';
  depth: number;
  nodes: ArtifactLineageNode[];
  edges: ArtifactLineageEdge[];
  truncated?: { reason: string; nodes?: number; at_depth?: number };
}

export interface UsageSnapshot {
  session_id: string;
  input_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cost_usd?: number;
  provenance: Provenance;
}

export interface ContextSnapshot {
  session_id: string;
  scope?: string;
  used_tokens?: number;
  limit_tokens?: number;
  live_tokens?: number;
  live_block_count?: number;
  tokens_by_kind?: Record<string, number>;
  categories?: Record<string, number>;
  autocompact_enabled?: boolean;
  autocompact_pct?: number;
  segments?: Array<Record<string, unknown>>;
  render_text?: string;
  render_keys?: Record<string, unknown>;
  provenance: Provenance;
}

export interface WorkspaceFileEntry {
  path: string;
  type: WireValue<'file' | 'dir'>;
  internal: boolean;
  size?: number;
  modified?: string;
}

export interface SessionDiff {
  path: string;
  status: string;
  applied: boolean;
  unified_diff?: string;
  message_id?: string;
  part_id?: string;
}

export interface ContextFile {
  path: string;
  display_path: string;
  workspace_id?: string;
  source?: string;
  mode: 'edit' | 'read' | 'pin';
  size?: number;
  last_modified?: string;
  language?: string;
  added_at?: string;
}

export interface ContextFrameItem {
  kind: string;
  source_id?: string;
  role?: string;
  path?: string;
  display_path?: string;
  included: boolean;
  reason?: string;
  tokens_estimated: number;
  metadata: Record<string, unknown>;
}

export interface ContextFrame {
  id: string;
  session_id: string;
  turn_id?: string;
  user_message_id?: string;
  assistant_message_id?: string;
  created_at: string;
  updated_at: string;
  status: 'assembled' | 'context_error' | 'completed' | 'error' | 'cancelled';
  model: Record<string, string>;
  agent: Record<string, unknown>;
  prompt: Record<string, unknown>;
  items: ContextFrameItem[];
  tokens_estimated: number;
  metadata: Record<string, unknown>;
}

export interface AsyncProcess {
  kind: 'agent' | 'mcp-task';
  id: string;
  title: string;
  live_state: RunState;
  status: string;
  parent_session_id?: string;
  child_session_id?: string;
  parent_turn_id?: string;
  handle_id?: string;
  host?: string;
  placement?: string;
  depth?: number;
  run_index?: number;
  created_at?: string;
  updated_at?: string;
  error_reason?: string;
  result?: {
    answer_excerpt?: string;
    message_ref?: string;
    workflow_state?: Record<string, unknown>;
  };
  metadata: Record<string, unknown>;
}

export interface AgentBlueprint {
  id: string;
  version: string;
  title: string;
  display_name: string;
  description?: string;
  scope: string;
  enabled: boolean;
  validation_errors: string[];
  kind: WireValue<'blueprint' | 'pack'>;
  metadata: Record<string, unknown>;
}

export interface AgentBlueprintSource {
  id: string;
  name: string;
  source: string;
  ref?: string;
  commit?: string;
  pinned_commit?: string;
  source_kind?: string;
  status: string;
  error?: string;
  added_at?: string;
  updated_at?: string;
  available_blueprints: Array<{
    id: string;
    title: string;
    version?: string;
    kind: WireValue<'blueprint' | 'pack'>;
    enabled: boolean;
    validation_errors: string[];
  }>;
}

export interface RelayStatus {
  configured: boolean;
  host?: string;
  mcp_url?: string;
  http_url?: string;
  credential_configured?: boolean;
  configuration_scope?: WireValue<'none' | 'server' | 'agent_run'>;
  can_manage?: boolean;
  reachable?: boolean;
  checked_at?: string;
  reason?: string;
  detail?: string;
  details: Record<string, unknown>;
}

export interface RelayConnectionInput {
  mcp_url: string;
  http_url: string;
  access_token?: string;
}

export interface ToolCatalogItem {
  id: string;
  name: string;
  title?: string;
  description?: string;
  server_id?: string;
  source?: string;
  status?: string;
  enabled?: boolean;
  owner?: string;
  tags: string[];
  visible_to: string[];
}

export interface McpServerDefinition {
  id: string;
  name: string;
  status: string;
  transport?: string;
  tools_count: number;
  tools: string[];
  error?: string;
  source?: string;
  enabled?: boolean;
  agent_blueprint_id?: string;
  spec: Record<string, unknown>;
}

export interface ExpertPackDefinition {
  id: string;
  version: string;
  title: string;
  display_name?: string;
  description: string;
  scope: string;
  enabled: boolean;
  validation_errors: string[];
  kind: 'pack';
  root?: string;
  root_path?: string;
  manifest_path?: string;
  definition_path?: string;
  defaults: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface PermissionPolicy {
  scope: string;
  scope_id?: string;
  action: string;
  priority?: number;
  kind?: 'tool' | 'domain' | 'fs_root' | 'plan_acl' | 'hook';
  tool_name_pattern?: string;
  path_pattern?: string;
  host_pattern?: string;
  modes?: string[];
  on?: string[];
  metadata: Record<string, unknown>;
}

export interface HookInspection {
  backend: string;
  enabled: boolean;
  hooks: Array<Record<string, unknown>>;
  recent_invocations: Array<Record<string, unknown>>;
}

export interface ServiceIntegrationHealth {
  name: string;
  status: string;
  detail?: string;
  summary?: string;
  config_source?: string;
  next_action?: string;
  endpoint?: string;
}

export interface ServiceHealth {
  healthy: boolean;
  uptime_s: number;
  overall_status: string;
  integrations: ServiceIntegrationHealth[];
  tool_hooks_installed?: boolean;
}

export interface RuntimeMetrics {
  uptime_s: number;
  sessions: { total: number; active: number; by_status: Record<string, number> };
  messages: { total: number; by_role: Record<string, number> };
  tokens: {
    input_total: number;
    output_total: number;
    cache_read_total: number;
    cache_write_total: number;
  };
  cost: { total_usd: number; by_provider: Record<string, number> };
  latencies: Record<string, { count: number; p50_ms: number; p95_ms: number; max_ms: number }>;
}

export interface MessageBlockContext {
  agent_id?: string;
  sequence?: number;
  stream_source?: string;
  channel?: string;
}

export type MessageBlock = MessageBlockContext &
  (
    | { id: string; type: 'text'; text: string; streaming?: boolean }
    | {
        id: string;
        type: 'reasoning';
        text: string;
        streaming?: boolean;
        source?: string;
        provider_source?: string;
        default_collapsed?: boolean;
      }
    | { id: string; type: 'tool'; tool_id: string; thought?: string }
    | { id: string; type: 'plan'; title: string; detail?: string }
    | { id: string; type: 'task'; task_id: string }
    | { id: string; type: 'subagent'; subagent_id: string }
    | { id: string; type: 'artifact'; artifact_id: string }
    | {
        id: string;
        type: 'action_card';
        title: string;
        detail?: string;
        source?: string;
        severity?: string;
        status?: string;
        actions: ActionCardAction[];
      }
    | { id: string; type: 'a2ui'; surface_id: string }
    | { id: string; type: 'citation'; label: string; uri: string }
    | { id: string; type: 'diff'; path: string; unified_diff: string }
    | { id: string; type: 'error'; code: string; message: string; recoverable: boolean }
    | { id: string; type: 'routing'; label: string; detail?: string }
    | { id: string; type: 'unknown'; original_type: string; raw: Record<string, unknown> }
  );

export interface MessageUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
}

export interface Message {
  id: string;
  session_id: string;
  run_id?: string;
  role: WireValue<'user' | 'assistant' | 'system'>;
  created_at: string;
  completed_at?: string;
  blocks: MessageBlock[];
  usage?: MessageUsage;
  cost_usd?: number;
  stop_reason?: string;
  error_info?: Record<string, unknown>;
}

export interface A2UISurface {
  id: string;
  session_id: string;
  run_id?: string;
  message_id?: string;
  part_id?: string;
  catalog_id: string;
  protocol_version: typeof A2UI_VERSION;
  revision: number;
  state: A2UIState;
  messages: unknown[];
  error?: string;
}

export interface PermissionLedgerItem {
  id: string;
  session_id: string;
  tool_name: string;
  input?: unknown;
  summary: string;
  risk?: WireValue<'low' | 'medium' | 'high'>;
  reason?: string;
  created_at: string;
  status: string;
  action?: WireValue<'allow' | 'deny' | 'allow_session' | 'allow_workspace'>;
  resolved_at?: string;
}

export interface ActionCardAction {
  id: string;
  label: string;
  enabled: boolean;
  behavior: {
    kind: string;
    handle_id?: string;
    reason?: string;
  };
}

export interface TranscriptSnapshot {
  cursor?: string;
  messages: Message[];
  tools: ToolInvocation[];
  tasks: Task[];
  subagents: SubagentRun[];
  artifacts: Artifact[];
  surfaces: A2UISurface[];
}

export interface CapabilityNegotiation {
  service?: { name: string; version: string };
  gact_versions: string[];
  a2ui_versions: string[];
  replay: { supported: boolean; retention?: number };
  capabilities: Record<string, boolean>;
  degradations: Degradation[];
  model_catalog: Provenance;
  active_model?: { provider_id: string; model_id: string; effort?: string };
}

export interface EntityState {
  connection?: Connection;
  capabilities?: CapabilityNegotiation;
  stream: StreamState;
  cursor?: string;
  workspaces: Record<string, Workspace>;
  sessions: Record<string, Session>;
  runs: Record<string, Run>;
  messages: Record<string, Message>;
  tools: Record<string, ToolInvocation>;
  approvals: Record<string, ApprovalRequest>;
  questions: Record<string, UserQuestion>;
  tasks: Record<string, Task>;
  subagents: Record<string, SubagentRun>;
  artifacts: Record<string, Artifact>;
  providers: Record<string, ProviderState>;
  usage: Record<string, UsageSnapshot>;
  context: Record<string, ContextSnapshot>;
  surfaces: Record<string, A2UISurface>;
  revisions: Record<string, number>;
  processed_cursors: string[];
}
export type {
  CommandDefinition,
  PromptDefinition,
  PromptProfileDefinition,
  ResolvedPromptDefinition,
} from './prompt-domain.js';
export type {
  LanguageModelConfiguration,
  LanguageModelPreset,
  ProviderDefinition,
  ProviderHandshake,
  ProviderModel,
  ProviderModelCatalog,
  ProviderModelRefreshResult,
  ProviderState,
} from './provider-domain.js';
