import type { ClioModelOption } from '@/lib/model-options';

/** The fleet reference (`<account>/<model>`) the service stores for a SPOTTER model. */
export function spotterModelRef(choice: Pick<ClioModelOption, 'providerId' | 'id'>): string {
  return `${choice.providerId}/${choice.id}`;
}

/** Split a fleet reference at its account; a malformed one names no model. */
export function parseSpotterModelRef(
  ref: string | undefined,
): { providerId: string; modelId: string } | undefined {
  const separator = ref?.indexOf('/') ?? -1;
  if (!ref || separator <= 0 || separator === ref.length - 1) return undefined;
  return { providerId: ref.slice(0, separator), modelId: ref.slice(separator + 1) };
}

/** A session's stored SPOTTER model reference (`metadata.spotter_model`), or empty. */
export function sessionSpotterModel(metadata: Record<string, unknown> | undefined): string {
  return typeof metadata?.spotter_model === 'string' ? metadata.spotter_model : '';
}
