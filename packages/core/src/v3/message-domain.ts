import type { ContextReferenceKind, ResourceDeliveryDecision } from './composer-domain.js';

export interface ActionCardAction {
  id: string;
  label: string;
  enabled: boolean;
  behavior: {
    kind: string;
    handle_id?: string;
    reason?: string;
    /** Validated against the shared inspection contract at the action boundary. */
    inspection?: unknown;
  };
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
    | {
        /**
         * Harness data the agent was given (plan reminder, todos, a path hint, a
         * context summary, ...). A `summarization` injection is the record of a
         * compaction: `text` is the summary that replaced the earlier context,
         * `trigger` says whether the service (`auto`) or the user (`manual`)
         * started it, and `compaction_id` matches its `compaction.*` events.
         */
        id: string;
        type: 'injection';
        source: string;
        text: string;
        call_id?: string;
        trigger?: 'auto' | 'manual';
        compaction_id?: string;
        /** Set when a variant try received it: the block belongs to that try's tab. */
        variants_id?: string;
        try_index?: number;
      }
    | {
        /**
         * A service notice recorded in the transcript. `source:
         * "compaction_failed"` is the durable record of a failed compaction:
         * `text` says why, `code` is its typed reason, `trigger` who started it,
         * and `compaction_id` matches its `compaction.*` events.
         */
        id: string;
        type: 'notice';
        source: string;
        text: string;
        code?: string;
        trigger?: 'auto' | 'manual';
        compaction_id?: string;
      }
    | { id: string; type: 'task'; task_id: string }
    | { id: string; type: 'subagent'; subagent_id: string; stage?: string; task?: string }
    | {
        id: string;
        type: 'agent_message';
        subagent_id: string;
        label: string;
        message: string;
        action?: string;
        status?: string;
      }
    | { id: string; type: 'artifact'; artifact_id: string }
    | {
        id: string;
        type: 'resource';
        resource_id: string;
        resource_revision: string;
        workspace_id: string;
        name: string;
        media_type: string;
        delivery?: ResourceDeliveryDecision;
      }
    | {
        id: string;
        type: 'context_reference';
        ref_kind: ContextReferenceKind;
        ref_id: string;
        label: string;
        revision: string;
        media_type: string;
        navigation: Record<string, unknown>;
      }
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
    | {
        id: string;
        type: 'mcp_app';
        app_instance_id: string;
        resource_uri: string;
        source_server: string;
        tool_name: string;
        data_ref: string;
        mime_type: string;
        height?: number;
      }
    | { id: string; type: 'citation'; label: string; uri: string }
    | { id: string; type: 'diff'; path: string; unified_diff: string }
    | { id: string; type: 'error'; code: string; message: string; recoverable: boolean }
    | { id: string; type: 'routing'; label: string; detail?: string }
    | { id: string; type: 'unknown'; original_type: string; raw: Record<string, unknown> }
  );
