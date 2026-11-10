import type { PendingInteraction, ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { isVariantPickInteraction } from '@/lib/variant-runs';

/** True for an MCP request the server first addressed to an agent. */
export function isAgentMcpInteraction(interaction: PendingInteraction): boolean {
  return (
    interaction.source.protocol === 'mcp' &&
    interaction.audience === 'agent' &&
    (interaction.routing_state === 'elicitation_routed_to_agent' ||
      interaction.routing_state === 'agent_elicitation_fallback_to_human')
  );
}

/** True for a native or MCP question that belongs in causal tool/task history. */
export function isCausalQuestionInteraction(interaction: PendingInteraction): boolean {
  return interaction.kind === 'question' || interaction.kind === 'mcp_task_input';
}

/** Return questions correlated with one causal tool invocation. */
export function questionInteractionsForTool(
  interactions: readonly PendingInteraction[] | undefined,
  toolId: string,
): PendingInteraction[] {
  return (interactions ?? [])
    .filter(
      (interaction) =>
        interaction.source.invocation_id === toolId && isCausalQuestionInteraction(interaction),
    )
    .sort(compareQuestionInteractions);
}

const SETTLED_TOOL_STATES = new Set(['succeeded', 'failed', 'denied', 'cancelled']);

/**
 * The pending approval a call is paused on, linked by the interaction's
 * `source.invocation_id`. Sessions recorded before the server sent that link
 * fall back to the tool name and every argument the permission names, so a
 * reloaded call still reads as waiting on the person.
 */
export function permissionInteractionForTool(
  interactions: readonly PendingInteraction[] | undefined,
  tool: ToolInvocation | undefined,
): PendingInteraction | undefined {
  if (!tool || SETTLED_TOOL_STATES.has(tool.state)) return undefined;
  return (interactions ?? []).find((interaction) => {
    if (interaction.kind !== 'permission' || interaction.status !== 'pending') return false;
    if (interaction.source.invocation_id) return interaction.source.invocation_id === tool.id;
    const call = interaction.payload?.tool_call;
    const name = interaction.source.tool_name ?? call?.tool_name;
    return name === tool.name && argumentsCover(call?.input, tool.input);
  });
}

/** What the person chose or wrote, by option label; the service keeps either shape. */
export function interactionAnswerLabels(interaction: PendingInteraction): string[] {
  const payload = (interaction.payload ?? {}) as Record<string, unknown>;
  const meta = (payload.answer_metadata ?? {}) as Record<string, unknown>;
  const selected = Array.isArray(meta.selected_options)
    ? meta.selected_options
    : Array.isArray(payload.selected_options)
      ? payload.selected_options
      : [];
  const labels = new Map(
    (interaction.payload?.options ?? []).map((option) => [String(option.value), option.label]),
  );
  const chosen = selected.map((value) => labels.get(String(value)) ?? String(value));
  const written = [meta.answer, payload.answer].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  return written && !chosen.includes(written) ? [...chosen, written] : chosen;
}

/**
 * The approval the person refused for this call, linked by `source.invocation_id`
 * (name and arguments only for sessions recorded before that link). A refused
 * script still projects as an ordinary failure with its permission cancelled,
 * so a failed call whose linked permission was refused reads as denied.
 */
export function deniedPermissionForTool(
  interactions: readonly PendingInteraction[] | undefined,
  tool: ToolInvocation | undefined,
): PendingInteraction | undefined {
  if (!tool || !['failed', 'denied'].includes(tool.state)) return undefined;
  return (interactions ?? []).find((interaction) => {
    if (interaction.kind !== 'permission') return false;
    if (!['cancelled', 'denied'].includes(interaction.status)) return false;
    if (interaction.source.invocation_id) return interaction.source.invocation_id === tool.id;
    const call = interaction.payload?.tool_call;
    const name = interaction.source.tool_name ?? call?.tool_name;
    return name === tool.name && argumentsCover(call?.input, tool.input);
  });
}

/** The call as the person decided it: a refused call is denied, not failed. */
export function withPermissionDecision(
  tool: ToolInvocation,
  interactions: readonly PendingInteraction[] | undefined,
): ToolInvocation {
  // The call's own projection decides the wording, so it never changes when the
  // service later drops the resolved approval record. Since the server projects a
  // refused call `denied`, the record only adds detail.
  if (tool.state === 'denied' || tool.presentation?.status === 'denied') {
    return tool.state === 'denied' && tool.presentation?.status === 'denied'
      ? tool
      : asDenied(tool, 'you denied it');
  }
  // Sessions recorded before that projection: the call's own refusal reason is
  // durable but cannot tell a person's refusal from a rule's, so it reads
  // "not approved" with or without the record. Only a call without that reason
  // falls back to the linked record.
  if (tool.state === 'failed' && refusedForApproval(tool)) return asDenied(tool, 'not approved');
  if (!deniedPermissionForTool(interactions, tool)) return tool;
  return asDenied(tool, 'you denied it');
}

function asDenied(tool: ToolInvocation, wording: string): ToolInvocation {
  const decision: ToolPresentationBlock = {
    id: 'permission-decision',
    type: 'text',
    label: 'Decision',
    text: wording,
  };
  return {
    ...tool,
    state: 'denied',
    presentation: {
      ...tool.presentation,
      summary: tool.presentation?.summary ?? '',
      status: 'denied',
      blocks: [
        ...(tool.presentation?.blocks ?? []).filter((block) => block.id !== decision.id),
        decision,
      ],
    },
  };
}

/** The agent refused the call because its approval was not given (not a rule's own reason). */
function refusedForApproval(tool: ToolInvocation): boolean {
  const texts = [
    typeof tool.error === 'string' ? tool.error : '',
    ...(tool.presentation?.blocks ?? [])
      .filter((block) => block.severity === 'error')
      .map((block) => block.text ?? ''),
  ];
  return texts.some((text) => /\(code_script_not_allowed\)|\bwas not approved\b/u.test(text));
}

function argumentsCover(asked: unknown, called: unknown): boolean {
  if (!asked || typeof asked !== 'object') return asked === undefined;
  if (!called || typeof called !== 'object') return false;
  const target = called as Record<string, unknown>;
  return Object.entries(asked as Record<string, unknown>).every(
    ([key, value]) => JSON.stringify(target[key]) === JSON.stringify(value),
  );
}

/**
 * Splits a call's questions: a plain pending question is said on the call's own row
 * ("waiting for you"), so it is not drawn again; everything else keeps its record.
 * An ask_user row also says its answer ("Answered · 2020–2023"), so a plain
 * answered question beside it is not drawn again either.
 */
export function splitWaitingQuestion(
  questions: readonly PendingInteraction[],
  toolName?: string,
): {
  waiting?: PendingInteraction;
  rest: PendingInteraction[];
} {
  const plain = (interaction: PendingInteraction) =>
    !isAgentMcpInteraction(interaction) &&
    !isVariantPickInteraction(interaction) &&
    interaction.source.tool_name !== 'plan_exit';
  const waiting = questions.find(
    (interaction) => interaction.status === 'pending' && plain(interaction),
  );
  return {
    waiting,
    rest: questions.filter(
      (interaction) =>
        interaction !== waiting &&
        !(
          toolName === 'ask_user' &&
          interaction.kind === 'question' &&
          interaction.status === 'answered' &&
          plain(interaction)
        ),
    ),
  };
}

/**
 * The call is paused on the person: the server holds it `pending`, or an approval
 * or question linked to it is still open. An async ask_user has already
 * `succeeded` with a task handle while its question waits, so the link decides.
 */
export function toolWaitsForYou(
  tool: ToolInvocation,
  interactions: readonly PendingInteraction[] | undefined,
): boolean {
  return (
    tool.state === 'pending' ||
    Boolean(permissionInteractionForTool(interactions, tool)) ||
    questionInteractionsForTool(interactions, tool.id).some(
      (interaction) => interaction.status === 'pending',
    )
  );
}

/** Human-readable identity that stays honest about request versus protocol round. */
export function questionInteractionRequestLabel(interaction: PendingInteraction): string {
  const kind =
    interaction.payload?.mode === 'url'
      ? 'URL consent request'
      : interaction.payload?.mode === 'form'
        ? 'Form request'
        : interaction.kind === 'mcp_task_input'
          ? 'Task input request'
          : interaction.source.protocol === 'native'
            ? 'Question'
            : 'Information request';
  const index = interaction.payload?.request_index;
  const count = interaction.payload?.request_count;
  return index && count ? `${kind} ${index} of ${count}` : kind;
}

function compareQuestionInteractions(left: PendingInteraction, right: PendingInteraction): number {
  const leftIndex = left.payload?.request_index;
  const rightIndex = right.payload?.request_index;
  if (leftIndex !== undefined && rightIndex !== undefined && leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }
  return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
}
