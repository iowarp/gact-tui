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

export interface PendingInteractionPayload {
  question_id?: string;
  question_kind?: WireValue<'freeform' | 'choice' | 'confirmation'>;
  options?: Array<{ label: string; value: string; description?: string }>;
  allow_freeform?: boolean;
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
  source: PendingInteractionSource;
  created_at: string;
  payload?: PendingInteractionPayload;
  actions?: string[];
}

/** Forward-compatible body accepted by the unified interaction response route. */
export interface PendingInteractionResponse {
  action?: string;
  answer?: string;
  selected_options?: string[];
  metadata?: Record<string, unknown>;
  message?: unknown;
}
