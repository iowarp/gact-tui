import type { Message as DomainMessage, PendingInteraction } from '@clio/core/v3';
import type { McpAppResponseActivityData } from './mcp-app-surface';

type McpAppBlock = Extract<DomainMessage['blocks'][number], { type: 'mcp_app' }>;

export type SpecialMessageExecutionMode = 'plan' | 'deep_research';

/** Keep a revised surface at its first transcript position, once per session. */
export function foldA2UIRevisionBlocks(messages: readonly DomainMessage[]): DomainMessage[] {
  const placed = new Set<string>();
  return messages.map((message) => ({
    ...message,
    blocks: message.blocks.filter((block) => {
      if (block.type !== 'a2ui') return true;
      const key = `${message.session_id}\u0000${block.surface_id}`;
      if (placed.has(key)) return false;
      placed.add(key);
      return true;
    }),
  }));
}

function actionContextFromText(text: string): Record<string, unknown> | undefined {
  const json = /Structured context:\s*(\{[^\n]*\})/u.exec(text)?.[1];
  if (!json) return undefined;
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function actionChoiceLabel(context: Record<string, unknown>): string {
  if (typeof context.approved === 'boolean') {
    return context.approved ? 'Approval given' : 'Approval declined';
  }
  const selectedId = context.selected_id;
  const selectedName = context.equipment ?? context.name ?? context.label;
  if ((typeof selectedId === 'string' || typeof selectedId === 'number') &&
    String(selectedId).length <= 60) {
    const name = typeof selectedName === 'string' && selectedName.length <= 60
      ? `${selectedName} (${selectedId})`
      : String(selectedId);
    return `Selected: ${name}`;
  }
  const entries = Object.entries(context);
  if (entries.length !== 1) return 'Choice sent';
  const [key, value] = entries[0]!;
  const readableValue = Array.isArray(value)
    ? value.length <= 5 && value.every((item) => typeof item === 'string' || typeof item === 'number')
      ? value.join(', ')
      : undefined
    : typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  if (!readableValue || readableValue.length > 100) return 'Choice sent';
  const readableKey = key.replaceAll('_', ' ');
  return `${readableKey[0]?.toUpperCase() ?? ''}${readableKey.slice(1)}: ${readableValue}`;
}

/** Keep protocol receipts out of the conversation and name choices plainly. */
export function projectA2UIActionMessages(messages: readonly DomainMessage[]): DomainMessage[] {
  return messages
    .filter((message) =>
      !(message.role === 'assistant' && !message.turn_id &&
        message.id.startsWith('msg_a2ui_a2ui_action_')),
    )
    .map((message) => {
      if (message.role !== 'user') return message;
      const context = message.metadata?.a2ui_action_context;
      const text = message.blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n');
      if (!message.metadata?.a2ui_action && !text.startsWith('A2UI event: ')) return message;
      const choices = context && typeof context === 'object' && !Array.isArray(context)
        ? context as Record<string, unknown>
        : actionContextFromText(text);
      const label = choices ? actionChoiceLabel(choices) : 'Action sent';
      return {
        ...message,
        blocks: message.blocks.map((block) =>
          block.type === 'text'
            ? { ...block, text: label }
            : block,
        ),
      };
    });
}

/** Return the non-default execution mode recorded when a human message was submitted. */
export function specialMessageExecutionMode(
  message: DomainMessage,
): SpecialMessageExecutionMode | undefined {
  if (message.role !== 'user') return undefined;
  const behavior = message.metadata?.behavior;
  if (!behavior || typeof behavior !== 'object' || Array.isArray(behavior)) return undefined;
  const mode = (behavior as Record<string, unknown>).execution_mode;
  return mode === 'plan' || mode === 'deep_research' ? mode : undefined;
}

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

/**
 * Whether a pending A2UI response owns this surface. The pending-response tray
 * renders that surface (it is where the user answers it), so the transcript
 * never mounts a second copy -- neither from a message's `a2ui` block nor as a
 * detached surface.
 */
export function surfaceAwaitsPendingResponse(
  interactions: readonly PendingInteraction[] | undefined,
  surfaceId: string,
): boolean {
  return (
    interactions?.some(
      (interaction) =>
        interaction.kind === 'a2ui' &&
        interaction.status === 'pending' &&
        interaction.source.surface_id === surfaceId,
    ) ?? false
  );
}
