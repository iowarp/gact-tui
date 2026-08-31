import { PROTOCOL_VERSION, TransportError, type RunState, type ToolState } from '@clio/core/v3';

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

/** Turns an opaque persistence failure into an actionable conversation state. */
export function conversationUnavailableMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (
    error instanceof TransportError &&
    error.code === 'internal_error' &&
    isRecord(error.details) &&
    error.details.original_message === 'GetBlob operation failed'
  ) {
    return (
      'Saved conversation storage is unavailable. The live connection remains independent; ' +
      'retry after the agent service recovers its storage.'
    );
  }
  return error.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
