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
 * The pending approval a call is paused on. A permission without the call's id
 * is matched by tool name and by every argument it names, so a reloaded call
 * still reads as waiting on the person rather than as an unrecorded outcome.
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
 * The approval the person refused for this call. The agent reports a refused call
 * as an ordinary failure and settles its permission as cancelled or denied, so a
 * failed call whose matching permission was refused reads as denied.
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
  if (tool.state === 'denied' || tool.presentation?.status === 'denied') return tool;
  // Prefer the retained approval record; resolved records age out of the service's
  // recent window, so the call's own refusal reason is the durable fallback.
  const decided = deniedPermissionForTool(interactions, tool);
  if (!decided && !(tool.state === 'failed' && refusedForApproval(tool))) return tool;
  const decision: ToolPresentationBlock = {
    id: 'permission-decision',
    type: 'text',
    label: 'Decision',
    text: decided ? 'you denied it' : 'not approved',
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
 */
export function splitWaitingQuestion(questions: readonly PendingInteraction[]): {
  waiting?: PendingInteraction;
  rest: PendingInteraction[];
} {
  const waiting = questions.find(
    (interaction) =>
      interaction.status === 'pending' &&
      !isAgentMcpInteraction(interaction) &&
      !isVariantPickInteraction(interaction) &&
      interaction.source.tool_name !== 'plan_exit',
  );
  return { waiting, rest: questions.filter((interaction) => interaction !== waiting) };
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
