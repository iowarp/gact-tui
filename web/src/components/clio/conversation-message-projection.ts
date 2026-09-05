import type { Message as DomainMessage, PendingInteraction } from '@clio/core/v3';
import type { McpAppResponseActivityData } from './mcp-app-surface';

type McpAppBlock = Extract<DomainMessage['blocks'][number], { type: 'mcp_app' }>;

/** Classify a native question answer envelope already owned by a projected interaction. */
export function isProjectedQuestionResumeEnvelope(
  message: DomainMessage,
  interactions: readonly PendingInteraction[] | undefined,
): boolean {
  if (message.role !== 'user') return false;
  // Plan approval resumes the same agent with a server-authored constraint-lift
  // envelope. It belongs in model context, not in the human transcript as a
  // second user-authored prompt.
  if (message.metadata?.plan_exit_resume === true) return true;
  if (message.metadata?.ask_user_resume !== true) return false;
  const questionId = message.metadata.ask_user_question_id;
  if (typeof questionId !== 'string' || questionId.length === 0) return false;
  return (interactions ?? []).some(
    (interaction) =>
      interaction.kind === 'question' &&
      interaction.source.protocol === 'native' &&
      Boolean(interaction.source.invocation_id) &&
      interaction.payload?.question_id === questionId,
  );
}

/** Decode one server-classified App transport message into visible ledger activity. */
export function mcpAppResponseForMessage(
  message: DomainMessage,
  apps: ReadonlyMap<string, McpAppBlock>,
): McpAppResponseActivityData | undefined {
  if (message.role !== 'user') return undefined;
  const raw = message.metadata?.mcp_app_response;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const appInstanceId = (raw as Record<string, unknown>).app_instance_id;
  if (typeof appInstanceId !== 'string' || !appInstanceId) return undefined;
  const app = apps.get(appInstanceId);
  if (!app) return undefined;
  return {
    appInstanceId,
    createdAt: message.created_at,
    messageId: message.id,
    sourceServer: app.source_server,
    state: (raw as Record<string, unknown>).state === 'pending' ? 'pending' : 'delivered',
    text: message.blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim(),
    toolName: app.tool_name,
  };
}

/** Correlate App response envelopes with the public App blocks in one transcript. */
export function mcpAppResponsesForMessages(
  messages: readonly DomainMessage[],
): ReadonlyMap<string, McpAppResponseActivityData> {
  const apps = new Map<string, McpAppBlock>();
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type === 'mcp_app') apps.set(block.app_instance_id, block);
    }
  }
  const responses = new Map<string, McpAppResponseActivityData>();
  for (const message of messages) {
    const response = mcpAppResponseForMessage(message, apps);
    if (response) responses.set(message.id, response);
  }
  return responses;
}
