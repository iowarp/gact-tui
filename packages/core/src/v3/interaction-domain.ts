import type { WireValue } from './domain.js';

export type PendingInteractionKind = WireValue<
  'question' | 'permission' | 'a2ui' | 'mcp_task_input'
>;

export interface PendingInteractionSource {
  protocol: WireValue<'native' | 'mcp'>;
  tool_name?: string;
  invocation_id?: string;
  surface_id?: string;
}

export interface PendingInteractionField {
  name: string;
  type: WireValue<'string' | 'number' | 'integer' | 'boolean' | 'array'>;
  title: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
  enum_names?: string[];
  multi?: boolean;
  item_type?: WireValue<'string' | 'number' | 'integer' | 'boolean'>;
  min_items?: number;
  max_items?: number;
  min_length?: number;
  max_length?: number;
}

export interface PendingInteractionPayload {
  question_id?: string;
  question_kind?: WireValue<'freeform' | 'choice' | 'confirmation' | 'multi_choice'>;
  options?: Array<{ label: string; value: string; description?: string }>;
  allow_freeform?: boolean;
  answer_metadata?: Record<string, unknown>;
  agent_answer_task?: {
    task_id?: string;
    child_session_id?: string;
  };
  mode?: WireValue<'form' | 'url'>;
  fields?: PendingInteractionField[];
  additional_properties?: boolean;
  url?: string;
  container?: string;
  punycode_warning?: boolean;
  punycode_host?: string;
  punycode_host_raw?: string;
  expires_at?: string;
  input_key?: string;
  permission_id?: string;
  tool_call?: { tool_name?: string; input?: unknown };
  revision?: number;
  server_id?: string;
  awaiting_question?: boolean;
  [key: string]: unknown;
}

/** One server-projected interaction awaiting a response from an attended session. */
export interface PendingInteraction {
  id: string;
  kind: PendingInteractionKind;
  owner_session_id: string;
  attended_session_id: string;
  task_id?: string;
  status: WireValue<'pending' | 'answered' | 'cancelled' | 'expired'>;
  title: string;
  prompt?: string;
  requires_human_response?: boolean;
  audience?: WireValue<'human' | 'agent'>;
  routing_state?: WireValue<'elicitation_routed_to_agent' | 'agent_elicitation_fallback_to_human'>;
  fallback_detail?: string;
  answered_by?: WireValue<'human' | 'agent'>;
  source: PendingInteractionSource;
  created_at: string;
  payload?: PendingInteractionPayload;
  actions?: string[];
}

/** The A2UI message identity a response is answering, for the server's own correlation. */
export interface PendingInteractionCorrelation {
  run_id?: string;
  message_id?: string;
  part_id?: string;
}

/** Forward-compatible body accepted by the unified interaction response route. */
export interface PendingInteractionResponse {
  action?: string;
  answer?: string;
  selected_options?: string[];
  metadata?: Record<string, unknown>;
  message?: unknown;
  correlation?: PendingInteractionCorrelation;
}
