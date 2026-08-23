import {
  mergeBlueprintBackedPacks,
  normalizeExpertPacks,
  normalizeValidationResult,
} from './catalog.js';
import { fetchAgentBlueprints } from './agent_blueprints.js';
import type { HttpTransport } from './transport.js';
import type {
  ExpertPackMutationOptions,
  ExpertPacksOptions,
  ExpertPacksResult,
  ExpertPackValidationResult,
  InstallExpertPackInput,
  InstallExpertPackResult,
  SessionExpertPackResult,
  SetSessionExpertPackInput,
  UpdateExpertPackResult,
  ValidateExpertPackInput,
} from './expert_pack_types.js';

export * from './expert_pack_types.js';

type ExpertPackTransport = Pick<HttpTransport, 'get' | 'post' | 'del'>;

export function fetchSessionExpertPack(
  client: ExpertPackTransport,
  sessionId: string,
): Promise<SessionExpertPackResult> {
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/expert-pack`);
}

export function setSessionExpertPackBinding(
  client: ExpertPackTransport,
  sessionId: string,
  body: SetSessionExpertPackInput,
): Promise<unknown> {
  return client.post(`/v1/sessions/${encodeURIComponent(sessionId)}/expert-pack`, body);
}

export async function validateExpertPackDefinition(
  client: ExpertPackTransport,
  body: ValidateExpertPackInput,
): Promise<ExpertPackValidationResult> {
  const raw = await client.post<Record<string, unknown>>('/v1/expert-packs/validate', body);
  return normalizeValidationResult(raw);
}

export async function fetchExpertPacks(
  client: ExpertPackTransport,
  options: ExpertPacksOptions = {},
): Promise<ExpertPacksResult> {
  const qs = new URLSearchParams();
  if (options.workspace_id) qs.set('workspace_id', options.workspace_id);
  if (options.session_id) qs.set('session_id', options.session_id);
  const raw = await client.get<Record<string, unknown>>(
    `/v1/expert-packs${qs.size ? `?${qs}` : ''}`,
  );
  let packs = normalizeExpertPacks(raw);
  try {
    const blueprints = await fetchAgentBlueprints(client, options);
    packs = mergeBlueprintBackedPacks(packs, blueprints.blueprints);
  } catch {
    // Older CLIO builds may not expose the blueprint catalog. The legacy
    // expert-pack list is still useful, so keep the original result.
  }
  return { packs };
}

export function installExpertPackDefinition(
  client: ExpertPackTransport,
  body: InstallExpertPackInput,
): Promise<InstallExpertPackResult> {
  return client.post<InstallExpertPackResult>('/v1/expert-packs/install', body);
}

export function updateExpertPackDefinition(
  client: ExpertPackTransport,
  packId: string,
  opts: ExpertPackMutationOptions = {},
): Promise<UpdateExpertPackResult> {
  return client.post<UpdateExpertPackResult>(
    `/v1/expert-packs/${encodeURIComponent(packId)}/update`,
    opts,
  );
}

export function removeExpertPack(
  client: ExpertPackTransport,
  packId: string,
  opts: ExpertPackMutationOptions = {},
): Promise<void> {
  const qs = new URLSearchParams();
  if (opts.scope) qs.set('scope', opts.scope);
  if (opts.workspace_id) qs.set('workspace_id', opts.workspace_id);
  return client.del<void>(
    `/v1/expert-packs/${encodeURIComponent(packId)}${qs.size ? `?${qs}` : ''}`,
  );
}
