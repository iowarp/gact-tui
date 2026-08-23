import type { AgentDef } from '../wire/types.js';
import type { HttpTransport } from './transport.js';
import type {
  AgentDetail,
  AgentsResult,
  CreateAgentInput,
  ExtractAgentInput,
  ExtractAgentResult,
  PutAgentInput,
} from './agent_types.js';

type AgentTransport = Pick<HttpTransport, 'get' | 'post' | 'del' | 'request'>;

export * from './agent_types.js';

export {
  enableAgentBlueprintMcp,
  fetchAgentBlueprint,
  fetchAgentBlueprints,
  fetchBlueprintSources,
  fetchSessionBlueprint,
  installAgentBlueprintDefinition,
  refreshAgentBlueprintSource,
  registerBlueprintSource,
  removeAgentBlueprint,
  removeBlueprintSource,
  setSessionBlueprintBinding,
  validateAgentBlueprintDefinition,
} from './agent_blueprints.js';
export type {
  AddBlueprintSourceInput,
  AgentBlueprintDefinition,
  AgentBlueprintDetail,
  AgentBlueprintsOptions,
  AgentBlueprintsResult,
  AgentBlueprintValidationResult,
  BlueprintSourceResult,
  BlueprintSourcesResult,
  InstallAgentBlueprintInput,
  InstallAgentBlueprintResult,
  SessionBlueprintResult,
  SetSessionBlueprintInput,
  UninstallAgentBlueprintOptions,
  ValidateAgentBlueprintInput,
} from './agent_blueprints.js';
export {
  fetchExpertPacks,
  fetchSessionExpertPack,
  installExpertPackDefinition,
  removeExpertPack,
  setSessionExpertPackBinding,
  updateExpertPackDefinition,
  validateExpertPackDefinition,
} from './expert_packs.js';
export type {
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
} from './expert_packs.js';

export function extractAgentDefinition(
  client: AgentTransport,
  body: ExtractAgentInput,
): Promise<ExtractAgentResult> {
  // Wire: clio reads { session_ids: [...], agent_id: "..." }.
  // Callers pass the singular shape that matches the UI.
  const payload: Record<string, unknown> = {
    session_ids: [body.session_id],
    agent_id: (body.name ?? '').toLowerCase().replace(/\W+/g, '-') || body.session_id,
  };
  if (body.description) payload['description'] = body.description;
  return client.post('/v1/agents/extract', payload);
}

export function removeAgent(client: AgentTransport, agentId: string): Promise<void> {
  return client.del(`/v1/agents/${encodeURIComponent(agentId)}`);
}

export function fetchAgent(client: AgentTransport, agentId: string): Promise<AgentDetail> {
  return client.get(`/v1/agents/${encodeURIComponent(agentId)}`);
}

export function replaceAgent(
  client: AgentTransport,
  agentId: string,
  def: PutAgentInput,
): Promise<AgentDef> {
  return client.request<AgentDef>(`/v1/agents/${encodeURIComponent(agentId)}`, 'PUT', {
    ...def,
    id: agentId,
  });
}

export function registerAgent(client: AgentTransport, def: CreateAgentInput): Promise<AgentDef> {
  return client.post<AgentDef>('/v1/agents', def);
}

export function fetchAgents(client: AgentTransport): Promise<AgentsResult> {
  return client.get<AgentsResult>('/v1/agents');
}
