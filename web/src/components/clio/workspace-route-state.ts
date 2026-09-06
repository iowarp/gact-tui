import {
  PROTOCOL_VERSION,
  type PendingInteraction,
  type PendingInteractionResponse,
  type RunState,
  type ToolState,
} from '@clio/core/v3';

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
    response: { action: 'answer', answer: feedback, selected_options: ['reject'] },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
