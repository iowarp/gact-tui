import type { Degradation } from '@clio/core/v3';

const OPTIONAL_CAPABILITIES = new Set(['attachments_upload', 'lsp', 'session_summary', 'voice']);

/** Keep optional or future features from misrepresenting an otherwise usable connection. */
export function materialConnectionDegradations(
  degradations: readonly Degradation[],
): Degradation[] {
  return degradations.filter(
    (degradation) => !degradation.capability || !OPTIONAL_CAPABILITIES.has(degradation.capability),
  );
}

/** Present a material service limitation without leaking wire or configuration vocabulary. */
export function connectionDegradationLabel(degradation: Degradation): string {
  if (degradation.code === 'model_catalog_unavailable' || degradation.capability === 'providers') {
    return 'Model choices have not been checked on this agent.';
  }
  if (degradation.capability === 'replay') {
    return 'Recent activity may need to reload after reconnecting.';
  }
  if (degradation.capability === 'files') {
    return 'Workspace files are not available from this agent.';
  }
  return degradation.reason
    .replace(/\bthe server\b/giu, 'this agent')
    .replace(/\bserver\b/giu, 'agent');
}
