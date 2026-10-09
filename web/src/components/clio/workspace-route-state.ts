import { isToolAnchoredQuestion } from '@/lib/inline-question';
import { isVariantPickInteraction } from '@/lib/variant-runs';
import {
  PROTOCOL_VERSION,
  type PendingInteraction,
  type PendingInteractionResponse,
  type RunState,
  type ToolState,
  type PendingSteer,
} from '@clio/core/v3';

/** Name only owners discovered through this session's hierarchy. */
export function interactionOwnerLabels(
  interactions: readonly { owner_session_id: string }[],
  discovered: ReadonlySet<string>,
  sessions: readonly { id: string; title?: string }[],
): Record<string, string> {
  const owners = new Map(sessions.map((session) => [session.id, session.title]));
  return Object.fromEntries(
    interactions.flatMap(({ owner_session_id: id }) => {
      const title = discovered.has(id) ? owners.get(id) : undefined;
      return title ? [[id, title]] : [];
    }),
  );
}

/** Claimed steering remains pending in the transcript but can no longer be cancelled. */
export function pendingSteerMessageIds(steers: readonly PendingSteer[]) {
  return {
    pendingMessageIds: new Set(
      steers
        .filter((steer) => steer.state === 'pending' || steer.state === 'claimed')
        .map((steer) => steer.message_id),
    ),
    cancellablePendingMessageIds: new Set(
      steers.filter((steer) => steer.state === 'pending').map((steer) => steer.message_id),
    ),
  };
}

/** Counts authoritative work that can still advance without inventing progress. */
export function countActiveWork(
  runs: readonly { state: RunState }[],
  tasks: readonly { state: RunState }[],
  tools: readonly { state: ToolState }[],
): number {
  return (
    runs.filter(({ state }) => state === 'running' || state === 'queued').length +
    tasks.filter(({ state }) => state === 'running' || state === 'queued').length +
    tools.filter(({ state }) => state === 'running' || state === 'pending').length
  );
}

/** Keeps live connectivity independent from a failed historical snapshot. */
export function canOpenSessionStream(
  gactVersions: readonly string[] | undefined,
  sessionId: string,
) {
  return Boolean(sessionId && gactVersions?.includes(PROTOCOL_VERSION));
}

/** Enables the composer picker only for the workspace-owned GACT 0.3 resource contract. */
export function canUploadWorkspaceResources(
  capabilities: Record<string, unknown> | undefined,
): boolean {
  const resources = capabilities?.x_clio_resources;
  return isRecord(resources) && resources.enabled === true;
}

/** Enables structured same-workspace references only when the service advertises them. */
export function canUseContextReferences(
  capabilities: Record<string, unknown> | undefined,
): boolean {
  const references = capabilities?.x_clio_context_references;
  return isRecord(references) && references.enabled === true;
}

/** Surfaces the service's own failure text; `details` stays display-only metadata. */
export function conversationUnavailableMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

/**
 * Keeps Plan reviews and the agent's own questions inline, in the log at their
 * tool call, whenever that tool call is present in the recovered transcript. A
 * pick between drafts always stays in the log, in its run's tabs block.
 */
export function responseTrayInteractions(
  interactions: readonly PendingInteraction[],
  anchoredInvocationIds: ReadonlySet<string>,
): PendingInteraction[] {
  return interactions.filter(
    (interaction) =>
      // A draft pick lives in its tabs block in the log, wherever it was asked.
      !isVariantPickInteraction(interaction) &&
      interaction.payload?.response_mode !== 'async' &&
      ((interaction.source.tool_name !== 'plan_exit' &&
        interaction.payload?.response_mode === 'blocking') ||
        (interaction.source.tool_name !== 'plan_exit' && !isToolAnchoredQuestion(interaction)) ||
        !interaction.source.invocation_id ||
        !anchoredInvocationIds.has(interaction.source.invocation_id)),
  );
}

/** Turns composer prose into explicit plan-revision feedback while Plan review is waiting. */
export function planRevisionFromComposer(
  interactions: readonly PendingInteraction[],
  input: {
    text: string;
    files?: readonly unknown[];
    references?: readonly unknown[];
    delivery: string;
  },
): { interaction: PendingInteraction; response: PendingInteractionResponse } | undefined {
  const feedback = input.text.trim();
  if (
    !feedback ||
    input.delivery !== 'start' ||
    (input.files?.length ?? 0) > 0 ||
    (input.references?.length ?? 0) > 0
  ) {
    return undefined;
  }
  const interaction = interactions.find(
    (candidate) =>
      candidate.status === 'pending' &&
      candidate.source.tool_name === 'plan_exit' &&
      (candidate.actions ?? []).includes('answer'),
  );
  if (!interaction) return undefined;
  return {
    interaction,
    response: {
      action: 'answer',
      answer: feedback,
      selected_options: ['reject'],
      metadata: { composer_user_message: true },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
